import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { queryBoolean } from "../../common/query";
import { UserSummary } from "../users";

const ShoppingItemBase = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  quantity: z.int().min(1),
  unit: z.string().min(1).nullable(),
  addedBy: UserSummary,
  addedAt: IsoDateTime,
});

/** Shopping item that has not been purchased yet. */
export const UnpurchasedShoppingItem = ShoppingItemBase.extend({
  isPurchased: z.literal(false),
  purchasedBy: z.null(),
  purchasedAt: z.null(),
});
export type UnpurchasedShoppingItem = z.infer<typeof UnpurchasedShoppingItem>;

/** Purchased shopping item with its purchase metadata. */
export const PurchasedShoppingItem = ShoppingItemBase.extend({
  isPurchased: z.literal(true),
  purchasedBy: UserSummary,
  purchasedAt: IsoDateTime,
});
export type PurchasedShoppingItem = z.infer<typeof PurchasedShoppingItem>;

/** Shopping list item within a household; `isPurchased` narrows the purchase metadata. */
export const ShoppingItem = z.discriminatedUnion("isPurchased", [
  UnpurchasedShoppingItem,
  PurchasedShoppingItem,
]);
export type ShoppingItem = z.infer<typeof ShoppingItem>;

/** The largest PostgreSQL `integer`, the type of the stored quantity. */
const MAX_QUANTITY = 2_147_483_647;

const Quantity = z.int().min(1).max(MAX_QUANTITY);

const ShoppingItemWritableFields = z.object({
  name: z.string().trim().min(1),
  quantity: Quantity,
  unit: z.string().trim().min(1).nullable().optional(),
});

/** Create a shopping item; quantity defaults to 1. */
export const CreateShoppingItemRequest = ShoppingItemWritableFields.extend({
  quantity: Quantity.default(1),
});
export type CreateShoppingItemRequest = z.infer<
  typeof CreateShoppingItemRequest
>;

/** Partial update of writable fields only (not purchase state). */
export const UpdateShoppingItemRequest = ShoppingItemWritableFields.partial();
export type UpdateShoppingItemRequest = z.infer<
  typeof UpdateShoppingItemRequest
>;

/** List shopping items; by default excludes purchased. Decodes raw URL query strings. */
export const ListShoppingItemsQuery = Pagination.extend({
  includePurchased: queryBoolean().default(false),
});
export type ListShoppingItemsQuery = z.infer<typeof ListShoppingItemsQuery>;

/** Paginated shopping item response list. */
export const ShoppingItemListResponse = paginatedResponse(ShoppingItem);
export type ShoppingItemListResponse = z.infer<typeof ShoppingItemListResponse>;

/**
 * Path params for item-scoped routes (update / purchase / unpurchase / delete).
 */
export const ShoppingItemIdParams = z.object({
  householdId: Id,
  itemId: Id,
});
export type ShoppingItemIdParams = z.infer<typeof ShoppingItemIdParams>;

/** Response for purchasing a shopping item. */
export type PurchaseShoppingItemResponse = PurchasedShoppingItem;

/** Response for unpurchasing a shopping item. */
export type UnpurchaseShoppingItemResponse = UnpurchasedShoppingItem;

/** Result of clearing purchased shopping items. */
export const ClearPurchasedShoppingItemsResponse = z.object({
  deletedCount: z.int().nonnegative(),
});
export type ClearPurchasedShoppingItemsResponse = z.infer<
  typeof ClearPurchasedShoppingItemsResponse
>;
