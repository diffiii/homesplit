import { randomUUID } from "node:crypto";
import {
  AttachmentMimeType,
  type CreateReceiptRequest,
  type ListReceiptsQuery,
  type Receipt,
  ReceiptFailureCode,
  type ReceiptItem,
  type ReceiptItemInput,
  type ReceiptListResponse,
  ReceiptStatus,
  type ReceiptSummary,
  toSafeInteger,
  type UpdateReceiptRequest,
} from "@homesplit/contracts";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { AiService } from "@/ai/ai.service";
import { attachmentInput } from "@/ai/ai-attachment";
import { db, type Executor, readSnapshot, type Transaction } from "@/db";
import { attachments, receiptItems, receipts } from "@/db/schema";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { userRole } from "@/features/users/user-projections";
import { AppError, notFound } from "@/http/app-error";
import { ObjectStorage } from "@/storage/object-storage";
import {
  ModelReceipt,
  type ReceiptDraft,
  ReceiptExtractionError,
  SCAN_RECEIPT_INSTRUCTIONS,
  SCAN_RECEIPT_TASK,
  toReceiptDraft,
} from "./receipt-extraction";

/**
 * A `processing` receipt not finished within this long counts as `failed`
 * with `EXTRACTION_INTERRUPTED`, so one the server stopped working on, such
 * as during a restart, can be retried. It's well past the AI timeout with
 * every retry.
 */
const STALE_INTERVAL = sql.raw("interval '10 minutes'");

const isStale = sql<boolean>`(${receipts.status} = 'processing' AND ${receipts.updatedAt} < now() - ${STALE_INTERVAL})`;

const createdBy = userRole("created_by");

const selectReceipts = (executor: Executor) =>
  executor
    .select({
      id: receipts.id,
      householdId: receipts.householdId,
      attachmentId: receipts.attachmentId,
      status: receipts.status,
      failureCode: receipts.failureCode,
      stale: isStale,
      merchant: receipts.merchant,
      purchasedOn: receipts.purchasedOn,
      currency: receipts.currency,
      totalCents: receipts.totalCents,
      discountCents: receipts.discountCents,
      createdBy: createdBy.summary,
      createdAt: receipts.createdAt,
      updatedAt: receipts.updatedAt,
    })
    .from(receipts)
    .innerJoin(createdBy.table, eq(createdBy.table.id, receipts.createdById));

type ReceiptRow = Awaited<ReturnType<typeof selectReceipts>>[number];

interface ReceiptState {
  failureCode: ReceiptFailureCode | null;
  status: ReceiptStatus;
}

/** The status members see: a stale `processing` receipt has failed. */
function stateOf(row: {
  failureCode: string | null;
  stale: boolean;
  status: string;
}): ReceiptState {
  if (row.stale) {
    return { status: "failed", failureCode: "EXTRACTION_INTERRUPTED" };
  }
  return {
    status: ReceiptStatus.parse(row.status),
    failureCode:
      row.failureCode === null
        ? null
        : ReceiptFailureCode.parse(row.failureCode),
  };
}

function toSummary(row: ReceiptRow): ReceiptSummary {
  return {
    id: row.id,
    householdId: row.householdId,
    attachmentId: row.attachmentId,
    ...stateOf(row),
    merchant: row.merchant,
    purchasedOn: row.purchasedOn,
    currency: row.currency,
    totalCents: row.totalCents === null ? null : toSafeInteger(row.totalCents),
    discountCents: toSafeInteger(row.discountCents),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReceipt(row: ReceiptRow, items: ReceiptItem[]): Receipt {
  const summary = toSummary(row);
  const itemsTotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    ...summary,
    items,
    itemsTotalCents,
    differenceCents:
      summary.totalCents === null
        ? null
        : itemsTotalCents - summary.discountCents - summary.totalCents,
  };
}

const inHousehold = (householdId: string, receiptId: string) =>
  and(eq(receipts.id, receiptId), eq(receipts.householdId, householdId));

async function findItems(
  executor: Executor,
  receiptId: string
): Promise<ReceiptItem[]> {
  const rows = await executor
    .select({
      id: receiptItems.id,
      position: receiptItems.position,
      name: receiptItems.name,
      quantity: receiptItems.quantity,
      unitPriceCents: receiptItems.unitPriceCents,
      discountCents: receiptItems.discountCents,
      totalCents: receiptItems.totalCents,
    })
    .from(receiptItems)
    .where(eq(receiptItems.receiptId, receiptId))
    .orderBy(asc(receiptItems.position), asc(receiptItems.id));
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    name: row.name,
    // A `numeric(12, 3)`, not an amount, so it fits a double exactly enough.
    quantity: Number(row.quantity),
    unitPriceCents: toSafeInteger(row.unitPriceCents),
    discountCents: toSafeInteger(row.discountCents),
    totalCents: toSafeInteger(row.totalCents),
  }));
}

async function findReceipt(
  executor: Executor,
  householdId: string,
  receiptId: string
): Promise<Receipt> {
  const [row] = await selectReceipts(executor).where(
    inHousehold(householdId, receiptId)
  );
  if (!row) {
    throw notFound();
  }
  return toReceipt(row, await findItems(executor, receiptId));
}

/** Locks the receipt for a write and returns its state. */
async function lockReceipt(
  tx: Transaction,
  householdId: string,
  receiptId: string
): Promise<ReceiptState> {
  const [row] = await tx
    .select({
      status: receipts.status,
      failureCode: receipts.failureCode,
      stale: isStale,
    })
    .from(receipts)
    .where(inHousehold(householdId, receiptId))
    .for("update");
  if (!row) {
    throw notFound();
  }
  return stateOf(row);
}

const receiptConfirmed = (): AppError =>
  new AppError(409, "RECEIPT_CONFIRMED", "The receipt is confirmed");

const receiptProcessing = (): AppError =>
  new AppError(409, "RECEIPT_PROCESSING", "The receipt is still being read");

const receiptNotFailed = (): AppError =>
  new AppError(409, "RECEIPT_NOT_FAILED", "Only a failed receipt is retried");

/** Codes stored for a failed run; anything unexpected is `EXTRACTION_FAILED`. */
function failureCodeOf(error: unknown): ReceiptFailureCode | null {
  if (error instanceof ReceiptExtractionError) {
    return error.code;
  }
  if (error instanceof AppError) {
    return ReceiptFailureCode.safeParse(error.code).data ?? null;
  }
  return null;
}

const itemValues = (
  receiptId: string,
  item: Omit<ReceiptItemInput, "id">,
  position: number
) => ({
  receiptId,
  position,
  name: item.name,
  quantity: String(item.quantity),
  unitPriceCents: BigInt(item.unitPriceCents),
  discountCents: BigInt(item.discountCents),
  totalCents: BigInt(item.totalCents),
});

/** A missing attachment and another household's get the same 400. */
async function findAttachment(
  householdId: string,
  attachmentId: string
): Promise<void> {
  const [row] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.householdId, householdId)
      )
    )
    .limit(1);
  if (!row) {
    throw new AppError(400, "INVALID_REFERENCE", "Invalid reference", {
      issues: [{ path: ["attachmentId"], message: "Unknown attachment" }],
    });
  }
}

@Injectable()
export class ReceiptsService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly ai: AiService;
  private readonly storage: ObjectStorage;
  /** Extractions still running, which shutdown waits for. */
  private readonly running = new Set<Promise<void>>();

  constructor(
    @Inject(AiService) ai: AiService,
    @Inject(ObjectStorage) storage: ObjectStorage
  ) {
    this.ai = ai;
    this.storage = storage;
  }

  /** Resolves once every extraction started so far has finished. */
  async idle(): Promise<void> {
    await Promise.allSettled(this.running);
  }

  onModuleDestroy(): Promise<void> {
    return this.idle();
  }

  list(
    householdId: string,
    { page, pageSize }: ListReceiptsQuery
  ): Promise<ReceiptListResponse> {
    const where = eq(receipts.householdId, householdId);
    return readSnapshot(async (tx) => {
      const rows = await selectReceipts(tx)
        .where(where)
        .orderBy(desc(receipts.createdAt), desc(receipts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalItems = await tx.$count(receipts, where);
      return { items: rows.map(toSummary), page, pageSize, totalItems };
    });
  }

  get(householdId: string, receiptId: string): Promise<Receipt> {
    return findReceipt(db, householdId, receiptId);
  }

  /**
   * Checks the attachment, then that AI is available, and answers with the
   * `processing` receipt while extraction runs in the background.
   */
  async create(
    { householdId, userId }: HouseholdContext,
    { attachmentId }: CreateReceiptRequest
  ): Promise<Receipt> {
    await findAttachment(householdId, attachmentId);
    await this.ai.assertAvailable(householdId);

    const extractionId = randomUUID();
    const [{ id }] = await db
      .insert(receipts)
      .values({
        householdId,
        attachmentId,
        status: "processing",
        extractionId,
        createdById: userId,
      })
      .returning({ id: receipts.id });
    const receipt = await findReceipt(db, householdId, id);
    this.startExtraction(id, extractionId);
    return receipt;
  }

  /**
   * Reads a failed receipt again, replacing its draft. AI availability is
   * checked first, so a household with `ai` off gets 403 at once.
   */
  async retry(householdId: string, receiptId: string): Promise<Receipt> {
    const current = await findReceipt(db, householdId, receiptId);
    if (current.status !== "failed") {
      throw receiptNotFailed();
    }
    await this.ai.assertAvailable(householdId);

    const extractionId = randomUUID();
    const receipt = await db.transaction(async (tx) => {
      const { status } = await lockReceipt(tx, householdId, receiptId);
      if (status !== "failed") {
        throw receiptNotFailed();
      }
      await tx
        .update(receipts)
        .set({
          status: "processing",
          failureCode: null,
          extractionId,
          updatedAt: sql`now()`,
        })
        .where(inHousehold(householdId, receiptId));
      return findReceipt(tx, householdId, receiptId);
    });
    this.startExtraction(receiptId, extractionId);
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
      const { items, totalCents, discountCents, ...text } = patch;
      if (items) {
        await assertOwnItems(tx, receiptId, items);
      }
      if (status === "confirmed") {
        throw receiptConfirmed();
      }
      if (status === "processing") {
        throw receiptProcessing();
      }

      if (items) {
        await replaceItems(tx, receiptId, items);
      }
      const set: PgUpdateSetSource<typeof receipts> = {
        ...text,
        status: "ready",
        failureCode: null,
        extractionId: null,
        updatedAt: sql`now()`,
      };
      if (totalCents !== undefined) {
        set.totalCents = totalCents === null ? null : BigInt(totalCents);
      }
      if (discountCents !== undefined) {
        set.discountCents = BigInt(discountCents);
      }
      await tx
        .update(receipts)
        .set(set)
        .where(inHousehold(householdId, receiptId));
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
      await tx.delete(receipts).where(inHousehold(householdId, receiptId));
    });
  }

  /** Runs after the response; errors end as a `failed` receipt, never a rejection. */
  private startExtraction(receiptId: string, extractionId: string): void {
    const run: Promise<void> = this.extract(receiptId, extractionId)
      .catch((error: unknown) => {
        this.logger.error(`Receipt ${receiptId} extraction: ${String(error)}`);
      })
      .finally(() => {
        this.running.delete(run);
      });
    this.running.add(run);
  }

  private async extract(
    receiptId: string,
    extractionId: string
  ): Promise<void> {
    try {
      const [source] = await db
        .select({
          householdId: receipts.householdId,
          storageKey: attachments.storageKey,
          mimeType: attachments.mimeType,
        })
        .from(receipts)
        .innerJoin(attachments, eq(attachments.id, receipts.attachmentId))
        .where(
          and(
            eq(receipts.id, receiptId),
            eq(receipts.extractionId, extractionId)
          )
        );
      if (!source) {
        return;
      }
      const content = await this.storage.get(source.storageKey);
      const file = await attachmentInput(
        content,
        AttachmentMimeType.parse(source.mimeType)
      );
      const reply = await this.ai.generate(source.householdId, {
        task: SCAN_RECEIPT_TASK,
        instructions: SCAN_RECEIPT_INSTRUCTIONS,
        input: [{ type: "text", text: "Read this receipt." }, file],
        output: ModelReceipt,
      });
      await saveDraft(receiptId, extractionId, toReceiptDraft(reply));
    } catch (error) {
      const code = failureCodeOf(error);
      if (code === null) {
        this.logger.error(`Receipt ${receiptId} extraction: ${String(error)}`);
      }
      await saveFailure(receiptId, extractionId, code ?? "EXTRACTION_FAILED");
    }
  }
}

/** Every given item ID is one of this receipt's own items. */
async function assertOwnItems(
  tx: Transaction,
  receiptId: string,
  items: ReceiptItemInput[]
): Promise<void> {
  const keptIds = items.flatMap(({ id }) => (id === undefined ? [] : [id]));
  const existing =
    keptIds.length === 0
      ? []
      : await tx
          .select({ id: receiptItems.id })
          .from(receiptItems)
          .where(
            and(
              eq(receiptItems.receiptId, receiptId),
              inArray(receiptItems.id, keptIds)
            )
          );
  const known = new Set(existing.map(({ id }) => id));
  const issues = items.flatMap(({ id }, index) =>
    id === undefined || known.has(id)
      ? []
      : [{ path: ["items", index, "id"], message: "Unknown item" }]
  );
  if (issues.length > 0) {
    throw new AppError(400, "INVALID_REFERENCE", "Invalid reference", {
      issues,
    });
  }
}

/**
 * Replaces the items in the given order. Items with an ID keep it, new items
 * get new IDs, and positions are renumbered from 0.
 */
async function replaceItems(
  tx: Transaction,
  receiptId: string,
  items: ReceiptItemInput[]
): Promise<void> {
  await tx.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId));
  if (items.length > 0) {
    await tx.insert(receiptItems).values(
      items.map(({ id, ...item }, position) => ({
        ...itemValues(receiptId, item, position),
        ...(id === undefined ? {} : { id }),
      }))
    );
  }
}

/** Only the run named by `extraction_id` may finish a processing receipt. */
const ownedBy = (receiptId: string, extractionId: string) =>
  and(
    eq(receipts.id, receiptId),
    eq(receipts.status, "processing"),
    eq(receipts.extractionId, extractionId)
  );

/** Writes the draft only while this run still owns the receipt. */
function saveDraft(
  receiptId: string,
  extractionId: string,
  draft: ReceiptDraft
): Promise<void> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(receipts)
      .set({
        status: "ready",
        extractionId: null,
        merchant: draft.merchant,
        purchasedOn: draft.purchasedOn,
        currency: draft.currency,
        totalCents: draft.totalCents === null ? null : BigInt(draft.totalCents),
        discountCents: BigInt(draft.discountCents),
        updatedAt: sql`now()`,
      })
      .where(ownedBy(receiptId, extractionId))
      .returning({ id: receipts.id });
    if (updated.length === 0) {
      return;
    }
    await tx.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId));
    if (draft.items.length > 0) {
      await tx
        .insert(receiptItems)
        .values(
          draft.items.map((item, position) =>
            itemValues(receiptId, item, position)
          )
        );
    }
  });
}

async function saveFailure(
  receiptId: string,
  extractionId: string,
  failureCode: ReceiptFailureCode
): Promise<void> {
  await db
    .update(receipts)
    .set({
      status: "failed",
      failureCode,
      extractionId: null,
      updatedAt: sql`now()`,
    })
    .where(ownedBy(receiptId, extractionId));
}
