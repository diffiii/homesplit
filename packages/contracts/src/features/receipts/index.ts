import { z } from "zod";

import { IsoDate, IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import {
  BoundedCents,
  CurrencyCode,
  MAX_AMOUNT_CENTS,
} from "../../common/money";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { UserSummary } from "../users";

/**
 * `processing` while the model reads the receipt, `ready` once it can be
 * edited, `failed` when extraction failed (retry it or fill it in by hand),
 * and `confirmed` once an expense was made from it, after which it's
 * read-only.
 */
export const RECEIPT_STATUSES = [
  "processing",
  "ready",
  "failed",
  "confirmed",
] as const;

export const ReceiptStatus = z.enum(RECEIPT_STATUSES);
export type ReceiptStatus = z.infer<typeof ReceiptStatus>;

/**
 * Why extraction failed. The AI codes match the errors `AiService` answers
 * with; `NOT_A_RECEIPT` means the model found no receipt in the file,
 * `EXTRACTION_INTERRUPTED` that the server stopped before it finished, and
 * `EXTRACTION_FAILED` anything else.
 */
export const RECEIPT_FAILURE_CODES = [
  "MODULE_DISABLED",
  "AI_UNAVAILABLE",
  "AI_LIMIT_EXCEEDED",
  "AI_TIMEOUT",
  "AI_PROVIDER_ERROR",
  "AI_INVALID_OUTPUT",
  "UNSUPPORTED_FILE_TYPE",
  "NOT_A_RECEIPT",
  "EXTRACTION_INTERRUPTED",
  "EXTRACTION_FAILED",
] as const;

export const ReceiptFailureCode = z.enum(RECEIPT_FAILURE_CODES);
export type ReceiptFailureCode = z.infer<typeof ReceiptFailureCode>;

/** Most items one receipt may have. */
export const MAX_RECEIPT_ITEMS = 200;

/** Longest merchant or item name, in characters. */
export const MAX_RECEIPT_TEXT_LENGTH = 200;

/** Largest item quantity; the column is `numeric(12, 3)`. */
export const MAX_RECEIPT_QUANTITY = 1_000_000;

/** Quantity with up to three decimals, so weighed products fit (`0.452` kg). */
export const ReceiptQuantity = z
  .number()
  .positive()
  .max(MAX_RECEIPT_QUANTITY)
  .multipleOf(0.001);
export type ReceiptQuantity = z.infer<typeof ReceiptQuantity>;

/** A non-negative request amount up to `MAX_AMOUNT_CENTS`. */
const NonNegativeBoundedCents = z.int().min(0).max(MAX_AMOUNT_CENTS);

const ReceiptText = z.string().trim().min(1).max(MAX_RECEIPT_TEXT_LENGTH);

/**
 * One line of a receipt, amounts in the receipt's minor units. A discount
 * printed as its own line, such as "Rabat", is folded into the item it
 * reduces, so `totalCents` is the line after its discount. Unit prices and
 * totals may be negative, for a returned deposit for example.
 */
export const ReceiptItem = z.object({
  id: Id,
  position: z.int().nonnegative(),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceCents: z.int(),
  discountCents: z.int().nonnegative(),
  totalCents: z.int(),
});
export type ReceiptItem = z.infer<typeof ReceiptItem>;

const ReceiptFields = z.object({
  id: Id,
  householdId: Id,
  attachmentId: Id,
  status: ReceiptStatus,
  /** Set only while `status` is `failed`. */
  failureCode: ReceiptFailureCode.nullable(),
  merchant: z.string().min(1).nullable(),
  purchasedOn: IsoDate.nullable(),
  currency: CurrencyCode.nullable(),
  totalCents: z.int().nonnegative().nullable(),
  /** Discounts on the whole receipt, apart from the line discounts. */
  discountCents: z.int().nonnegative(),
  createdBy: UserSummary,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/**
 * A scanned receipt with its items in `position` order. `itemsTotalCents` is
 * the sum of the item totals, and `differenceCents` is
 * `itemsTotalCents - discountCents - totalCents`: zero when the items add up
 * to the total, and `null` while the total is unknown.
 */
export const Receipt = ReceiptFields.extend({
  items: z.array(ReceiptItem),
  itemsTotalCents: z.int(),
  differenceCents: z.int().nullable(),
});
export type Receipt = z.infer<typeof Receipt>;

/** A receipt in the list, without its items. */
export const ReceiptSummary = ReceiptFields;
export type ReceiptSummary = z.infer<typeof ReceiptSummary>;

/** Starts reading an uploaded attachment, an image or a PDF, as a receipt. */
export const CreateReceiptRequest = z.object({
  attachmentId: Id,
});
export type CreateReceiptRequest = z.infer<typeof CreateReceiptRequest>;

/**
 * An item in an edit. With an `id`, it's that existing item of the receipt;
 * without one, it's a new item.
 */
export const ReceiptItemInput = z.object({
  id: Id.optional(),
  name: ReceiptText,
  quantity: ReceiptQuantity,
  unitPriceCents: BoundedCents,
  discountCents: NonNegativeBoundedCents.default(0),
  totalCents: BoundedCents,
});
export type ReceiptItemInput = z.infer<typeof ReceiptItemInput>;

/**
 * Partial update of a draft. `items`, when given, replaces the whole list in
 * that order: existing items keep their IDs, items left out are removed, and
 * items without an ID are added. An `id` may appear only once.
 */
export const UpdateReceiptRequest = z
  .object({
    merchant: ReceiptText.nullable().optional(),
    purchasedOn: IsoDate.nullable().optional(),
    currency: CurrencyCode.nullable().optional(),
    totalCents: NonNegativeBoundedCents.nullable().optional(),
    discountCents: NonNegativeBoundedCents.optional(),
    items: z.array(ReceiptItemInput).max(MAX_RECEIPT_ITEMS).optional(),
  })
  .superRefine(({ items }, ctx) => {
    const seen = new Set<string>();
    items?.forEach(({ id }, index) => {
      if (id === undefined) {
        return;
      }
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate item id",
          path: ["items", index, "id"],
        });
      }
      seen.add(id);
    });
  });
export type UpdateReceiptRequest = z.infer<typeof UpdateReceiptRequest>;

/** List receipts, newest first. */
export const ListReceiptsQuery = Pagination;
export type ListReceiptsQuery = z.infer<typeof ListReceiptsQuery>;

/** Paginated receipt list. */
export const ReceiptListResponse = paginatedResponse(ReceiptSummary);
export type ReceiptListResponse = z.infer<typeof ReceiptListResponse>;

/** Path params for receipt-scoped routes. */
export const ReceiptIdParams = z.object({
  householdId: Id,
  receiptId: Id,
});
export type ReceiptIdParams = z.infer<typeof ReceiptIdParams>;
