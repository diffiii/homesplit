import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { UserSummary } from "../users";

/** Shopping list item within a household. */
export const ShoppingItem = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  quantity: z.int().min(1),
  unit: z.string().min(1).nullable(), // TODO: maybe we can use some kind of enum here?
  isPurchased: z.boolean(),
  addedBy: UserSummary,
  purchasedBy: UserSummary.nullable(),
  addedAt: IsoDateTime,
  purchasedAt: IsoDateTime.nullable(),
});
export type ShoppingItem = z.infer<typeof ShoppingItem>;

const ShoppingItemWritableFields = z.object({
  name: z.string().min(1),
  quantity: z.int().min(1),
  unit: z.string().min(1).nullable().optional(),
});

/** Create a shopping item; quantity defaults to 1. */
export const CreateShoppingItemRequest = ShoppingItemWritableFields.extend({
  quantity: z.int().min(1).default(1),
});

/** Partial update of writable fields only (not purchase state). */
export const UpdateShoppingItemRequest = ShoppingItemWritableFields.partial();

/** List shopping items; by default excludes purchased. */
export const ListShoppingItemsQuery = Pagination.extend({
  includePurchased: z.boolean().default(false),
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
export type PurchaseShoppingItemResponse = ShoppingItem;

/** Response for unpurchasing a shopping item. */
export type UnpurchaseShoppingItemResponse = ShoppingItem;

/** Path params for clearing all purchased items in a household. */
export const ClearPurchasedShoppingItemsParams = z.object({
  householdId: Id,
});
export type ClearPurchasedShoppingItemsParams = z.infer<
  typeof ClearPurchasedShoppingItemsParams
>;

/** Result of clearing purchased shopping items. */
export const ClearPurchasedShoppingItemsResponse = z.object({
  deletedCount: z.int().nonnegative(),
});
export type ClearPurchasedShoppingItemsResponse = z.infer<
  typeof ClearPurchasedShoppingItemsResponse
>;
