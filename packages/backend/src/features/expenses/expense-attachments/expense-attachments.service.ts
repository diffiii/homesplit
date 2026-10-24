import type {
  AttachmentSummary,
  ExpenseAttachmentListResponse,
  LinkExpenseAttachmentRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import { attachments, expenseAttachments } from "@/db/schema";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { AppError, notFound } from "@/http/app-error";
import {
  expenseInHousehold,
  linkedAttachments,
  toAttachmentSummaries,
  toAttachmentSummary,
} from "../expenses/expenses.repository";
import { lockExpenseForWrite } from "../expenses/expenses.service";

/**
 * Finds the household's file and locks its row `FOR KEY SHARE` until the
 * transaction ends. Cleanup skips locked rows, so it can't delete the file
 * while it's being linked. A missing file and another household's get the
 * same 400.
 */
async function lockAttachmentForLink(
  tx: Transaction,
  householdId: string,
  attachmentId: string
): Promise<AttachmentSummary> {
  const [row] = await tx
    .select({
      id: attachments.id,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.householdId, householdId)
      )
    )
    .for("key share");
  if (!row) {
    throw new AppError(400, "INVALID_REFERENCE", "Invalid reference", {
      issues: [{ path: ["attachmentId"], message: "Unknown attachment" }],
    });
  }
  return toAttachmentSummary(row);
}

@Injectable()
export class ExpenseAttachmentsService {
  /** Another household's expense answers 404, the same as a missing one. */
  async list(
    householdId: string,
    expenseId: string
  ): Promise<ExpenseAttachmentListResponse> {
    const row = await db.query.expenses.findFirst({
      where: expenseInHousehold(householdId, expenseId),
      columns: {},
      with: { attachments: linkedAttachments },
    });
    if (!row) {
      throw notFound();
    }
    return { items: toAttachmentSummaries(row.attachments) };
  }

  /**
   * Links one of the household's files to the expense. Only the expense's
   * author or an admin+ may, as for editing it.
   */
  link(
    household: HouseholdContext,
    expenseId: string,
    { attachmentId }: LinkExpenseAttachmentRequest
  ): Promise<AttachmentSummary> {
    const { householdId } = household;
    return db.transaction(async (tx) => {
      await lockExpenseForWrite(tx, household, expenseId);
      const attachment = await lockAttachmentForLink(
        tx,
        householdId,
        attachmentId
      );
      const inserted = await tx
        .insert(expenseAttachments)
        .values({ expenseId, attachmentId, householdId })
        .onConflictDoNothing()
        .returning({ attachmentId: expenseAttachments.attachmentId });
      if (inserted.length === 0) {
        throw new AppError(
          409,
          "ATTACHMENT_ALREADY_LINKED",
          "The attachment is already linked to this expense"
        );
      }
      return attachment;
    });
  }

  /**
   * Removes the link and keeps the file, which cleanup deletes once nothing
   * references it. A file that isn't linked to the expense answers 404.
   */
  async unlink(
    household: HouseholdContext,
    expenseId: string,
    attachmentId: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await lockExpenseForWrite(tx, household, expenseId);
      const deleted = await tx
        .delete(expenseAttachments)
        .where(
          and(
            eq(expenseAttachments.expenseId, expenseId),
            eq(expenseAttachments.attachmentId, attachmentId)
          )
        )
        .returning({ attachmentId: expenseAttachments.attachmentId });
      if (deleted.length === 0) {
        throw notFound();
      }
    });
  }
}
