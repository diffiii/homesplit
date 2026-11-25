import {
  type AssignReceiptItemsRequest,
  type ConfirmReceiptRequest,
  type ConfirmReceiptResponse,
  CreateExpenseRequest,
  type Receipt,
  type ReceiptSplit,
  type ReceiptSplitResult,
  type ReceiptStatus,
  splitReceipt,
  type UserSummary,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import {
  expenseAttachments,
  member,
  receiptItemAssignments,
  receiptItems,
  receipts,
} from "@/db/schema";
import { assertCategoryInHousehold } from "@/features/expense-categories/category-reference";
import {
  createExpense,
  findExpense,
} from "@/features/expenses/expenses/expenses.service";
import { lockHouseholdForLedgerWrite } from "@/features/expenses/household-ledger-lock";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { assertUsersEligible } from "@/features/households/access/household-access";
import { AppError, invalidReference } from "@/http/app-error";
import { findReceipt, inHousehold, lockReceipt } from "./receipts.repository";
import { receiptConfirmed, receiptProcessing } from "./receipts.service";

const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

/** Assignments and confirming need the draft: not while it's read, and not once it's confirmed. */
function assertDraft(status: ReceiptStatus): void {
  if (status === "confirmed") {
    throw receiptConfirmed();
  }
  if (status === "processing") {
    throw receiptProcessing();
  }
}

/** A receipt confirms only from `ready`; a failed one is edited by hand first. */
function assertConfirmable(status: ReceiptStatus): void {
  assertDraft(status);
  if (status === "failed") {
    throw conflict(
      "RECEIPT_NOT_READY",
      "Fill in or retry the failed receipt first"
    );
  }
}

/** `splitReceipt` over the receipt's items, none of them negative. */
function calculateSplit(receipt: Receipt): ReceiptSplitResult {
  return splitReceipt(
    receipt.items.map(({ id, totalCents, assignments }) => ({
      id,
      totalCents,
      assignments: assignments.map(({ user, shares }) => ({
        userId: user.id,
        shares,
      })),
    })),
    receipt.discountCents
  );
}

/**
 * The request's category when it sends one, `null` included; otherwise the
 * scan's, but only a confident one, as clients preselect it.
 */
function categoryOf(
  { suggestedCategory }: Receipt,
  { categoryId }: ConfirmReceiptRequest
): string | null {
  if (categoryId !== undefined) {
    return categoryId;
  }
  return suggestedCategory?.confidence === "high"
    ? suggestedCategory.categoryId
    : null;
}

function toSplit(receipt: Receipt): ReceiptSplit {
  const result = calculateSplit(receipt);
  const users = new Map<string, UserSummary>(
    receipt.items.flatMap(({ assignments }) =>
      assignments.map(({ user }) => [user.id, user] as const)
    )
  );
  return {
    currency: receipt.currency,
    totalCents: result.totalCents,
    people: result.amounts.flatMap(({ userId, amountCents }) => {
      const user = users.get(userId);
      return user ? [{ user, amountCents }] : [];
    }),
    unassignedCents: result.unassignedCents,
    unassignedItemIds: result.unassignedItemIds,
    differenceCents: receipt.differenceCents,
  };
}

/** A receipt whose items add up and are all assigned, with its split. */
interface SplittableReceipt {
  currency: string;
  split: ReceiptSplitResult;
  totalCents: number;
}

/** The header is complete, every item is assigned, and the items add up to the total. */
function assertSplitsExactly(receipt: Receipt): SplittableReceipt {
  const { currency, totalCents } = receipt;
  if (currency === null || totalCents === null) {
    throw conflict(
      "RECEIPT_INCOMPLETE",
      "The receipt needs a currency and a total",
      {
        fields: [
          ...(currency === null ? ["currency"] : []),
          ...(totalCents === null ? ["totalCents"] : []),
        ],
      }
    );
  }
  const split = calculateSplit(receipt);
  if (split.unassignedItemIds.length > 0) {
    throw conflict(
      "RECEIPT_ITEMS_UNASSIGNED",
      "Every item needs someone assigned",
      { itemIds: split.unassignedItemIds }
    );
  }
  if (receipt.differenceCents !== 0) {
    throw conflict(
      "RECEIPT_TOTAL_MISMATCH",
      "The items don't add up to the receipt's total",
      { differenceCents: receipt.differenceCents }
    );
  }
  return { currency, totalCents, split };
}

/** Rejects assignees who aren't current members any more, such as after leaving. */
async function assertAssigneesCurrent(
  tx: Transaction,
  householdId: string,
  userIds: readonly string[]
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const rows = await tx
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, householdId),
        inArray(member.userId, [...userIds])
      )
    );
  const current = new Set(rows.map(({ userId }) => userId));
  const departed = userIds.filter((userId) => !current.has(userId));
  if (departed.length > 0) {
    throw conflict(
      "RECEIPT_ASSIGNEE_NOT_MEMBER",
      "Items are assigned to someone who left the household",
      { userIds: departed }
    );
  }
}

/**
 * The expense the receipt becomes, checked with the same schema as
 * `POST /expenses`. A name or date neither the request nor the receipt has
 * fails here, at `["name"]` or `["expenseDate"]`.
 */
function toExpenseRequest(
  receipt: Receipt,
  { currency, totalCents, split }: SplittableReceipt,
  body: ConfirmReceiptRequest & { categoryId: string | null; payerId: string }
): CreateExpenseRequest {
  const request = CreateExpenseRequest.safeParse({
    name: body.name ?? receipt.merchant ?? undefined,
    description: body.description ?? null,
    categoryId: body.categoryId,
    expenseDate: body.expenseDate ?? receipt.purchasedOn ?? undefined,
    total: { amountCents: totalCents, currency },
    payers: [{ userId: body.payerId, amountCents: totalCents }],
    allocation: {
      method: "exact",
      participants: split.amounts.map(({ userId, amountCents }) => ({
        userId,
        amountCents,
      })),
    },
  });
  if (!request.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid request", {
      issues: request.error.issues.map(({ path, message }) => ({
        path,
        message,
      })),
    });
  }
  return request.data;
}

@Injectable()
export class ReceiptConfirmationService {
  /**
   * Replaces the assignments of the listed items. Items must be this
   * receipt's, and assignees current members of the household.
   */
  assign(
    householdId: string,
    receiptId: string,
    { items }: AssignReceiptItemsRequest
  ): Promise<Receipt> {
    return db.transaction(async (tx) => {
      const { status } = await lockReceipt(tx, householdId, receiptId);

      const itemIds = items.map(({ itemId }) => itemId);
      const known = await tx
        .select({ id: receiptItems.id })
        .from(receiptItems)
        .where(
          and(
            eq(receiptItems.receiptId, receiptId),
            inArray(receiptItems.id, itemIds)
          )
        );
      const knownIds = new Set(known.map(({ id }) => id));
      const unknown = items.flatMap(({ itemId }, index) =>
        knownIds.has(itemId)
          ? []
          : [{ path: ["items", index, "itemId"], message: "Unknown item" }]
      );
      if (unknown.length > 0) {
        throw invalidReference(unknown);
      }
      await assertUsersEligible(
        tx,
        householdId,
        items.flatMap(({ assignees }, index) =>
          assignees.map(({ userId }, assignee) => ({
            userId,
            path: ["items", index, "assignees", assignee, "userId"],
          }))
        ),
        "current"
      );
      assertDraft(status);

      await tx
        .delete(receiptItemAssignments)
        .where(inArray(receiptItemAssignments.receiptItemId, itemIds));
      const rows = items.flatMap(({ itemId, assignees }) =>
        assignees.map(({ userId, shares }) => ({
          receiptItemId: itemId,
          householdId,
          userId,
          shares,
        }))
      );
      if (rows.length > 0) {
        await tx.insert(receiptItemAssignments).values(rows);
      }
      await tx
        .update(receipts)
        .set({ updatedAt: sql`now()` })
        .where(inHousehold(householdId, receiptId));
      return findReceipt(tx, householdId, receiptId);
    });
  }

  /** How the receipt would split now; nothing is saved. */
  async split(householdId: string, receiptId: string): Promise<ReceiptSplit> {
    return toSplit(await findReceipt(db, householdId, receiptId));
  }

  /**
   * Creates the expense, links the receipt's file to it, and confirms the
   * receipt, all in one transaction, so a failure at any step leaves
   * nothing behind. The expense goes through the same checks as
   * `POST /expenses`, with the author being the caller. It never calls AI:
   * the category defaults to what the scan suggested.
   */
  confirm(
    household: HouseholdContext,
    receiptId: string,
    body: ConfirmReceiptRequest
  ): Promise<ConfirmReceiptResponse> {
    const { householdId } = household;
    return db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      const { status } = await lockReceipt(tx, householdId, receiptId);
      // Read under the lock, so it's what any earlier write committed.
      const receipt = await findReceipt(tx, householdId, receiptId);

      const payerId = body.payerId ?? receipt.createdBy.id;
      await assertUsersEligible(
        tx,
        householdId,
        [{ userId: payerId, path: ["payerId"] }],
        "current"
      );
      if (body.categoryId) {
        await assertCategoryInHousehold(tx, householdId, body.categoryId);
      }
      assertConfirmable(status);

      const ready = assertSplitsExactly(receipt);
      await assertAssigneesCurrent(
        tx,
        householdId,
        ready.split.amounts.map(({ userId }) => userId)
      );
      // A suggestion is never another household's category: the scan only
      // sends this household's, and a deleted one is already null.
      const request = toExpenseRequest(receipt, ready, {
        ...body,
        payerId,
        categoryId: categoryOf(receipt, body),
      });

      const expenseId = await createExpense(tx, household, request);
      await tx.insert(expenseAttachments).values({
        expenseId,
        attachmentId: receipt.attachmentId,
        householdId,
      });
      await tx
        .update(receipts)
        .set({ status: "confirmed", expenseId, updatedAt: sql`now()` })
        .where(inHousehold(householdId, receiptId));

      return {
        receipt: await findReceipt(tx, householdId, receiptId),
        expense: await findExpense(tx, householdId, expenseId),
      };
    });
  }
}
