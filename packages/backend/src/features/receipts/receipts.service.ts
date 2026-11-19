import { randomUUID } from "node:crypto";
import type {
  CreateReceiptRequest,
  ListReceiptsQuery,
  Receipt,
  ReceiptListResponse,
  UpdateReceiptRequest,
} from "@homesplit/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { AiService } from "@/ai/ai.service";
import { db } from "@/db";
import { findHouseholdAttachment } from "@/features/attachments/household-attachment";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { AppError } from "@/http/app-error";
import { ReceiptExtraction } from "./receipt-extraction";
import {
  assertOwnItems,
  deleteReceipt,
  findReceipt,
  insertReceipt,
  listReceipts,
  lockReceipt,
  startProcessing,
  updateDraft,
} from "./receipts.repository";

const receiptConfirmed = (): AppError =>
  new AppError(409, "RECEIPT_CONFIRMED", "The receipt is confirmed");

const receiptProcessing = (): AppError =>
  new AppError(409, "RECEIPT_PROCESSING", "The receipt is still being read");

const receiptNotFailed = (): AppError =>
  new AppError(409, "RECEIPT_NOT_FAILED", "Only a failed receipt is retried");

/**
 * The receipt routes' state rules: which status allows which change. Queries
 * live in `receipts.repository.ts`, and the background run in
 * `receipt-extraction.ts`.
 */
@Injectable()
export class ReceiptsService {
  private readonly ai: AiService;
  private readonly extraction: ReceiptExtraction;

  constructor(
    @Inject(AiService) ai: AiService,
    @Inject(ReceiptExtraction) extraction: ReceiptExtraction
  ) {
    this.ai = ai;
    this.extraction = extraction;
  }

  list(
    householdId: string,
    query: ListReceiptsQuery
  ): Promise<ReceiptListResponse> {
    return listReceipts(householdId, query);
  }

  get(householdId: string, receiptId: string): Promise<Receipt> {
    return findReceipt(db, householdId, receiptId);
  }

  /**
   * Checks the attachment, then that AI is available, and answers with the
   * `processing` receipt while the run reads it in the background.
   */
  async create(
    { householdId, userId }: HouseholdContext,
    { attachmentId }: CreateReceiptRequest
  ): Promise<Receipt> {
    await findHouseholdAttachment(householdId, attachmentId);
    await this.ai.assertAvailable(householdId);

    const extractionId = randomUUID();
    const receiptId = await insertReceipt({
      householdId,
      attachmentId,
      extractionId,
      createdById: userId,
    });
    const receipt = await findReceipt(db, householdId, receiptId);
    this.extraction.start(receiptId, extractionId);
    return receipt;
  }

  /**
   * Reads a failed receipt again, replacing its draft. Under the receipt's
   * lock, a receipt that isn't `failed` answers 409 first, then AI
   * availability is checked, so a household with `ai` off gets 403.
   */
  async retry(householdId: string, receiptId: string): Promise<Receipt> {
    const extractionId = randomUUID();
    const receipt = await db.transaction(async (tx) => {
      const { status } = await lockReceipt(tx, householdId, receiptId);
      if (status !== "failed") {
        throw receiptNotFailed();
      }
      await this.ai.assertAvailable(householdId);
      await startProcessing(tx, householdId, receiptId, extractionId);
      return findReceipt(tx, householdId, receiptId);
    });
    this.extraction.start(receiptId, extractionId);
    return receipt;
  }

  /**
   * Edits the draft. A `failed` receipt becomes `ready`, which is how a
   * member fills one in by hand.
   */
  update(
    householdId: string,
    receiptId: string,
    patch: UpdateReceiptRequest
  ): Promise<Receipt> {
    return db.transaction(async (tx) => {
      const { status } = await lockReceipt(tx, householdId, receiptId);
      if (patch.items) {
        await assertOwnItems(tx, receiptId, patch.items);
      }
      if (status === "confirmed") {
        throw receiptConfirmed();
      }
      if (status === "processing") {
        throw receiptProcessing();
      }
      await updateDraft(tx, householdId, receiptId, patch);
      return findReceipt(tx, householdId, receiptId);
    });
  }

  /** Discards a draft in any status but `confirmed`; a running extraction writes nothing. */
  delete(householdId: string, receiptId: string): Promise<void> {
    return db.transaction(async (tx) => {
      const { status } = await lockReceipt(tx, householdId, receiptId);
      if (status === "confirmed") {
        throw receiptConfirmed();
      }
      await deleteReceipt(tx, householdId, receiptId);
    });
  }
}
