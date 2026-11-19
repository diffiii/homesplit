import {
  AttachmentMimeType,
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
  and,
  asc,
  desc,
  eq,
  inArray,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { longestRequestMs } from "@/ai/ai.config";
import { db, type Executor, readSnapshot, type Transaction } from "@/db";
import {
  attachments,
  receiptItemAssignments,
  receiptItems,
  receipts,
} from "@/db/schema";
import { userRole } from "@/features/users/user-projections";
import { invalidReference, notFound } from "@/http/app-error";

/** Reading the file and writing the draft, on top of the AI call itself. */
const EXTRACTION_MARGIN_MS = 5 * 60 * 1000;

/**
 * A `processing` receipt not finished within this long counts as `failed`
 * with `EXTRACTION_INTERRUPTED`, so one the server stopped working on, such
 * as during a restart, can be retried. It's the longest the AI call can take
 * with the current config, retries included, plus a margin, so a run still
 * going never shows as interrupted.
 */
export const STALE_AFTER_MS = longestRequestMs() + EXTRACTION_MARGIN_MS;

// A number computed at startup, so it's safe to write into the query.
const STALE_INTERVAL = sql.raw(`interval '${STALE_AFTER_MS} milliseconds'`);

const isStale = sql<boolean>`(${receipts.status} = 'processing' AND ${receipts.updatedAt} < now() - ${STALE_INTERVAL})`;

const createdBy = userRole("created_by");
const payer = userRole("payer");
const assignee = userRole("assignee");

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
      expenseId: receipts.expenseId,
      payer: payer.summary,
      confirmedAt: receipts.confirmedAt,
      createdBy: createdBy.summary,
      createdAt: receipts.createdAt,
      updatedAt: receipts.updatedAt,
    })
    .from(receipts)
    .innerJoin(createdBy.table, eq(createdBy.table.id, receipts.createdById))
    .leftJoin(payer.table, eq(payer.table.id, receipts.payerId));

type ReceiptRow = Awaited<ReturnType<typeof selectReceipts>>[number];

export interface ReceiptState {
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
    expenseId: row.expenseId,
    payer: row.payer,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
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

export const inHousehold = (householdId: string, receiptId: string) =>
  and(eq(receipts.id, receiptId), eq(receipts.householdId, householdId));

/** Only the run named by `extraction_id` may finish a processing receipt. */
const ownedBy = (receiptId: string, extractionId: string) =>
  and(
    eq(receipts.id, receiptId),
    eq(receipts.status, "processing"),
    eq(receipts.extractionId, extractionId)
  );

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
  const assignments = await executor
    .select({
      itemId: receiptItemAssignments.receiptItemId,
      user: assignee.summary,
      shares: receiptItemAssignments.shares,
    })
    .from(receiptItemAssignments)
    .innerJoin(
      receiptItems,
      eq(receiptItems.id, receiptItemAssignments.receiptItemId)
    )
    .innerJoin(
      assignee.table,
      eq(assignee.table.id, receiptItemAssignments.userId)
    )
    .where(eq(receiptItems.receiptId, receiptId))
    .orderBy(asc(receiptItemAssignments.userId));
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    name: row.name,
    // A `numeric(12, 3)`, not an amount, so it fits a double exactly enough.
    quantity: Number(row.quantity),
    unitPriceCents: toSafeInteger(row.unitPriceCents),
    discountCents: toSafeInteger(row.discountCents),
    totalCents: toSafeInteger(row.totalCents),
    assignments: assignments
      .filter(({ itemId }) => itemId === row.id)
      .map(({ user, shares }) => ({ user, shares })),
  }));
}

/** The receipt with its items; another household's answers 404. */
export async function findReceipt(
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

/** A page of the household's receipts, newest first, without items. */
export function listReceipts(
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

/** Locks the receipt for a write and returns its state. */
export async function lockReceipt(
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

/** A new receipt, `processing` under `extractionId`; returns its ID. */
export async function insertReceipt(values: {
  attachmentId: string;
  createdById: string;
  extractionId: string;
  householdId: string;
}): Promise<string> {
  const [{ id }] = await db
    .insert(receipts)
    .values({ ...values, status: "processing" })
    .returning({ id: receipts.id });
  return id;
}

/** Hands the receipt to a new run, which alone may write its result. */
export async function startProcessing(
  tx: Transaction,
  householdId: string,
  receiptId: string,
  extractionId: string
): Promise<void> {
  await tx
    .update(receipts)
    .set({
      status: "processing",
      failureCode: null,
      extractionId,
      updatedAt: sql`now()`,
    })
    .where(inHousehold(householdId, receiptId));
}

export async function deleteReceipt(
  tx: Transaction,
  householdId: string,
  receiptId: string
): Promise<void> {
  await tx.delete(receipts).where(inHousehold(householdId, receiptId));
}

/** Every given item ID is one of this receipt's own items. */
export async function assertOwnItems(
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
    throw invalidReference(issues);
  }
}

/** Header fields as columns; `undefined` leaves a column as it is. */
function headerColumns({
  totalCents,
  discountCents,
  ...text
}: Omit<UpdateReceiptRequest, "items">) {
  return {
    ...text,
    totalCents:
      totalCents === undefined || totalCents === null
        ? totalCents
        : BigInt(totalCents),
    discountCents:
      discountCents === undefined ? undefined : BigInt(discountCents),
  };
}

/**
 * Replaces the items in the given order. Items with an ID keep it and their
 * assignments, items left out are deleted with theirs, new items get new IDs,
 * and positions are renumbered from 0. Callers checked the IDs with
 * `assertOwnItems`, or have none, so the upsert only updates this receipt's
 * items.
 */
async function replaceItems(
  tx: Transaction,
  receiptId: string,
  items: ReceiptItemInput[]
): Promise<void> {
  const keptIds = items.flatMap(({ id }) => (id === undefined ? [] : [id]));
  await tx
    .delete(receiptItems)
    .where(
      and(
        eq(receiptItems.receiptId, receiptId),
        keptIds.length === 0 ? undefined : notInArray(receiptItems.id, keptIds)
      )
    );
  if (items.length === 0) {
    return;
  }
  await tx
    .insert(receiptItems)
    .values(
      items.map(({ id, ...item }, position) => ({
        ...(id === undefined ? {} : { id }),
        receiptId,
        position,
        name: item.name,
        quantity: String(item.quantity),
        unitPriceCents: BigInt(item.unitPriceCents),
        discountCents: BigInt(item.discountCents),
        totalCents: BigInt(item.totalCents),
      }))
    )
    .onConflictDoUpdate({
      target: receiptItems.id,
      set: {
        position: sql`excluded.position`,
        name: sql`excluded.name`,
        quantity: sql`excluded.quantity`,
        unitPriceCents: sql`excluded.unit_price_cents`,
        discountCents: sql`excluded.discount_cents`,
        totalCents: sql`excluded.total_cents`,
      },
    });
}

/**
 * The one way a draft is written, by a member's edit or by a finished run:
 * the given header fields, the items when given, and `ready`, but only where
 * `where` still matches. Returns false when it doesn't, such as for a run
 * that a retry or a discard overtook.
 */
async function writeDraft(
  tx: Transaction,
  receiptId: string,
  where: SQL | undefined,
  { items, ...header }: UpdateReceiptRequest
): Promise<boolean> {
  const updated = await tx
    .update(receipts)
    .set({
      ...headerColumns(header),
      status: "ready",
      failureCode: null,
      extractionId: null,
      updatedAt: sql`now()`,
    })
    .where(where)
    .returning({ id: receipts.id });
  if (updated.length === 0) {
    return false;
  }
  if (items) {
    await replaceItems(tx, receiptId, items);
  }
  return true;
}

/** A member's edit of a receipt locked by `lockReceipt`. */
export async function updateDraft(
  tx: Transaction,
  householdId: string,
  receiptId: string,
  patch: UpdateReceiptRequest
): Promise<void> {
  await writeDraft(tx, receiptId, inHousehold(householdId, receiptId), patch);
}

/** A finished run's draft, written only while the run still owns the receipt. */
export function saveExtractedDraft(
  receiptId: string,
  extractionId: string,
  draft: UpdateReceiptRequest
): Promise<boolean> {
  return db.transaction((tx) =>
    writeDraft(tx, receiptId, ownedBy(receiptId, extractionId), draft)
  );
}

/** A failed run's code, written only while the run still owns the receipt. */
export async function saveFailure(
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

/** The file a run reads, or `null` once another run or a discard took over. */
export async function findExtractionSource(
  receiptId: string,
  extractionId: string
): Promise<{
  householdId: string;
  mimeType: AttachmentMimeType;
  storageKey: string;
} | null> {
  const [row] = await db
    .select({
      householdId: receipts.householdId,
      storageKey: attachments.storageKey,
      mimeType: attachments.mimeType,
    })
    .from(receipts)
    .innerJoin(attachments, eq(attachments.id, receipts.attachmentId))
    .where(ownedBy(receiptId, extractionId));
  return row
    ? { ...row, mimeType: AttachmentMimeType.parse(row.mimeType) }
    : null;
}
