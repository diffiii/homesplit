import {
  CreateExpenseRequest,
  type ReceiptSplit,
  splitReceipt,
} from "@homesplit/contracts";
import { type MockDb, type MockExpense, type MockReceipt, now } from "../db";
import { conflict, invalidReference, MockApiError } from "../errors";
import type { MockRoutes } from "../routes";
import { assertCategory, renderExpense } from "./expenses";
import { renderReceipt } from "./receipts";
import { assertCurrentMembers, findInHousehold } from "./shared";

/** `splitReceipt` over the stored items, as the backend's `calculateSplit`. */
function calculateSplit(receipt: MockReceipt) {
  return splitReceipt(
    receipt.items.map(({ id, totalCents, assignments }) => ({
      id,
      totalCents,
      assignments,
    })),
    receipt.discountCents
  );
}

function renderSplit(db: MockDb, receipt: MockReceipt): ReceiptSplit {
  const result = calculateSplit(receipt);
  const rendered = renderReceipt(db, receipt);
  return {
    currency: receipt.currency,
    totalCents: result.totalCents,
    people: result.amounts.map(({ userId, amountCents }) => ({
      user: db.summary(userId),
      amountCents,
    })),
    unassignedCents: result.unassignedCents,
    unassignedItemIds: result.unassignedItemIds,
    differenceCents: rendered.differenceCents,
  };
}

/** Assigning and confirming need the draft: not while it's read, nor once it's confirmed. */
function assertDraft(receipt: MockReceipt): void {
  if (receipt.status === "confirmed") {
    throw conflict("RECEIPT_CONFIRMED", "The receipt is confirmed");
  }
  if (receipt.status === "processing") {
    throw conflict("RECEIPT_PROCESSING", "The receipt is still being read");
  }
}

/** The checks `assertSplitsExactly` makes before a receipt becomes an expense. */
function assertSplitsExactly(db: MockDb, receipt: MockReceipt) {
  const { currency, totalCents } = receipt;
  if (currency === null || totalCents === null) {
    throw conflict(
      "RECEIPT_INCOMPLETE",
      "The receipt needs a currency and a total"
    );
  }
  const split = calculateSplit(receipt);
  if (split.unassignedItemIds.length > 0) {
    throw conflict(
      "RECEIPT_ITEMS_UNASSIGNED",
      "Every item needs someone assigned"
    );
  }
  if (renderReceipt(db, receipt).differenceCents !== 0) {
    throw conflict(
      "RECEIPT_TOTAL_MISMATCH",
      "The items don't add up to the receipt's total"
    );
  }
  const departed = split.amounts.filter(
    ({ userId }) => !db.member(receipt.householdId, userId)
  );
  if (departed.length > 0) {
    throw conflict(
      "RECEIPT_ASSIGNEE_NOT_MEMBER",
      "Items are assigned to someone who left the household"
    );
  }
  return { currency, totalCents, split };
}

/** Assigning items, the split preview, and confirming, like `ReceiptConfirmationService`. */
export const receiptConfirmationRoutes: MockRoutes = {
  assignReceiptItems: {
    module: "expenses",
    resolve: ({ db, household, params, body }) => {
      const receipt = findInHousehold(
        db.state.receipts,
        household.id,
        params.receiptId
      );
      const items = new Map(receipt.items.map((item) => [item.id, item]));
      const unknown = body.items.flatMap(({ itemId }, index) =>
        items.has(itemId)
          ? []
          : [{ path: ["items", index, "itemId"], message: "Unknown item" }]
      );
      if (unknown.length > 0) {
        throw invalidReference(unknown);
      }
      assertCurrentMembers(
        db,
        household.id,
        body.items.flatMap(({ assignees }, index) =>
          assignees.map(({ userId }, assignee) => ({
            userId,
            path: ["items", index, "assignees", assignee, "userId"],
          }))
        )
      );
      assertDraft(receipt);
      for (const { itemId, assignees } of body.items) {
        const item = items.get(itemId);
        if (item) {
          item.assignments = assignees.map(({ userId, shares }) => ({
            userId,
            shares,
          }));
        }
      }
      receipt.updatedAt = now();
      return renderReceipt(db, receipt);
    },
  },

  getReceiptSplit: {
    resolve: ({ db, household, params }) =>
      renderSplit(
        db,
        findInHousehold(db.state.receipts, household.id, params.receiptId)
      ),
  },

  confirmReceipt: {
    module: "expenses",
    resolve: ({ db, household, userId, params, body }) => {
      const receipt = findInHousehold(
        db.state.receipts,
        household.id,
        params.receiptId
      );
      const payerId = body.payerId ?? receipt.createdById;
      assertCurrentMembers(db, household.id, [
        { userId: payerId, path: ["payerId"] },
      ]);
      assertCategory(db, household.id, body.categoryId);
      assertDraft(receipt);
      if (receipt.status === "failed") {
        throw conflict(
          "RECEIPT_NOT_READY",
          "Fill in or retry the failed receipt first"
        );
      }
      const { currency, totalCents, split } = assertSplitsExactly(db, receipt);
      const suggested =
        receipt.suggestedCategory?.confidence === "high"
          ? receipt.suggestedCategory.categoryId
          : null;
      const request = CreateExpenseRequest.safeParse({
        name: body.name ?? receipt.merchant ?? undefined,
        description: body.description ?? null,
        categoryId: body.categoryId === undefined ? suggested : body.categoryId,
        expenseDate: body.expenseDate ?? receipt.purchasedOn ?? undefined,
        total: { amountCents: totalCents, currency },
        payers: [{ userId: payerId, amountCents: totalCents }],
        allocation: {
          method: "exact",
          participants: split.amounts.map(({ userId: id, amountCents }) => ({
            userId: id,
            amountCents,
          })),
        },
      });
      if (!request.success) {
        throw new MockApiError(400, "VALIDATION_ERROR", "Invalid request", {
          issues: request.error.issues.map(({ path, message }) => ({
            path,
            message,
          })),
        });
      }
      const time = now();
      const expense: MockExpense = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name: request.data.name,
        description: request.data.description ?? null,
        total: request.data.total,
        payers: request.data.payers,
        authorId: userId,
        categoryId: request.data.categoryId ?? null,
        expenseDate: request.data.expenseDate,
        allocation: request.data.allocation,
        createdAt: time,
        updatedAt: time,
      };
      db.state.expenses.push(expense);
      db.state.expenseAttachments.push({
        householdId: household.id,
        expenseId: expense.id,
        attachmentId: receipt.attachmentId,
        createdAt: time,
      });
      Object.assign(receipt, {
        status: "confirmed",
        expenseId: expense.id,
        updatedAt: time,
      });
      return {
        receipt: renderReceipt(db, receipt),
        expense: renderExpense(db, expense),
      };
    },
  },
};
