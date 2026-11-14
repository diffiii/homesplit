import { z } from "zod";

import { AI_ERROR_CODES } from "../../common/ai-errors";
import { IsoDate, IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import {
  BoundedCents,
  CurrencyCode,
  MAX_AMOUNT_CENTS,
  MAX_SHARES,
} from "../../common/money";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { Expense } from "../expenses";
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
 * Why extraction failed: any of the AI layer's own codes, `NOT_A_RECEIPT`
 * when the model found no receipt in the file, `EXTRACTION_INTERRUPTED` when
 * the server stopped before it finished, and `EXTRACTION_FAILED` for
 * anything else.
 */
export const RECEIPT_FAILURE_CODES = [
  ...AI_ERROR_CODES,
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

/** Most people one item may be assigned to. */
export const MAX_RECEIPT_ITEM_ASSIGNEES = 100;

/**
 * One person's part of an item, as a number of shares. One share each
 * splits the item equally; for an item with a quantity above 1, the shares
 * can be units (2 of 3 beers); a weighed item only uses shares.
 */
export const ReceiptItemAssignment = z.object({
  user: UserSummary,
  shares: z.int().positive(),
});
export type ReceiptItemAssignment = z.infer<typeof ReceiptItemAssignment>;

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
  /** Who has the item, ordered by user ID. Empty while it's unassigned. */
  assignments: z.array(ReceiptItemAssignment),
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
  /**
   * The expense a confirmed receipt became, or `null`: before confirming, and
   * after the expense's amounts were edited, which unlinks the receipt.
   */
  expenseId: Id.nullable(),
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
 * Everything a draft holds, with the limits both an edit and extraction must
 * meet. Extraction parses the model's draft with it, and `UpdateReceiptRequest`
 * is its partial form.
 */
export const ReceiptDraftFields = z.object({
  merchant: ReceiptText.nullable(),
  purchasedOn: IsoDate.nullable(),
  currency: CurrencyCode.nullable(),
  totalCents: NonNegativeBoundedCents.nullable(),
  discountCents: NonNegativeBoundedCents,
  items: z.array(ReceiptItemInput).max(MAX_RECEIPT_ITEMS),
});
export type ReceiptDraftFields = z.infer<typeof ReceiptDraftFields>;

/**
 * Partial update of a draft. `items`, when given, replaces the whole list in
 * that order: existing items keep their IDs, items left out are removed, and
 * items without an ID are added. An `id` may appear only once.
 */
export const UpdateReceiptRequest = ReceiptDraftFields.partial().superRefine(
  ({ items }, ctx) => {
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
  }
);
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

/**
 * Sets who has the listed items. Each entry replaces that item's
 * assignments; an empty `assignees` makes it unassigned again, and items
 * left out keep theirs. So several selected items, or every item for "split
 * everything equally", are assigned in one request.
 */
export const AssignReceiptItemsRequest = z
  .object({
    items: z
      .array(
        z.object({
          itemId: Id,
          assignees: z
            .array(
              z.object({
                userId: Id,
                shares: z.int().positive().max(MAX_SHARES),
              })
            )
            .max(MAX_RECEIPT_ITEM_ASSIGNEES),
        })
      )
      .min(1)
      .max(MAX_RECEIPT_ITEMS),
  })
  .superRefine(({ items }, ctx) => {
    const itemIds = new Set<string>();
    items.forEach(({ itemId, assignees }, index) => {
      if (itemIds.has(itemId)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate item id",
          path: ["items", index, "itemId"],
        });
      }
      itemIds.add(itemId);
      const userIds = new Set<string>();
      assignees.forEach(({ userId }, assignee) => {
        if (userIds.has(userId)) {
          ctx.addIssue({
            code: "custom",
            message: "Duplicate user id",
            path: ["items", index, "assignees", assignee, "userId"],
          });
        }
        userIds.add(userId);
      });
    });
  });
export type AssignReceiptItemsRequest = z.infer<
  typeof AssignReceiptItemsRequest
>;

/**
 * How the receipt would split now, as `splitReceipt` calculates it.
 * `totalCents` is what's split, the items' total minus the receipt-level
 * discount; each person's `amountCents` and `unassignedCents` add up to it.
 * `differenceCents` is the receipt's own, so confirming needs it at zero and
 * `unassignedItemIds` empty.
 */
export const ReceiptSplit = z.object({
  currency: CurrencyCode.nullable(),
  totalCents: z.int(),
  people: z.array(z.object({ user: UserSummary, amountCents: z.int() })),
  unassignedCents: z.int(),
  unassignedItemIds: z.array(Id),
  differenceCents: z.int().nullable(),
});
export type ReceiptSplit = z.infer<typeof ReceiptSplit>;

/**
 * Turns a receipt into an expense. Every field is optional: the payer
 * defaults to who scanned the receipt, the name and date to its merchant and
 * purchase date, and the category to a suggestion when AI is on (`null`
 * means none). The total and the currency are the receipt's, and the splits
 * are `exact`, from its assignments.
 */
export const ConfirmReceiptRequest = z.strictObject({
  payerId: Id.optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  expenseDate: IsoDate.optional(),
  categoryId: Id.nullable().optional(),
});
export type ConfirmReceiptRequest = z.infer<typeof ConfirmReceiptRequest>;

/** The confirmed receipt and the expense made from it. */
export const ConfirmReceiptResponse = z.object({
  receipt: Receipt,
  expense: Expense,
});
export type ConfirmReceiptResponse = z.infer<typeof ConfirmReceiptResponse>;
