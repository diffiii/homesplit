import { HouseholdIdParams } from "../features/households";
import {
  ClearPurchasedShoppingItemsResponse,
  CreateShoppingItemRequest,
  ListShoppingItemsQuery,
  PurchasedShoppingItem,
  ShoppingItem,
  ShoppingItemIdParams,
  ShoppingItemListResponse,
  UnpurchasedShoppingItem,
  UpdateShoppingItemRequest,
} from "../features/shopping";
import type { Endpoint } from "./endpoint";
import { HOUSEHOLD } from "./paths";

const SHOPPING_ITEM = `${HOUSEHOLD}/shopping-items/:itemId`;

export const shoppingEndpoints = {
  listShoppingItems: {
    method: "GET",
    path: `${HOUSEHOLD}/shopping-items`,
    params: HouseholdIdParams,
    query: ListShoppingItemsQuery,
    status: 200,
    response: ShoppingItemListResponse,
  },
  createShoppingItem: {
    method: "POST",
    path: `${HOUSEHOLD}/shopping-items`,
    params: HouseholdIdParams,
    body: CreateShoppingItemRequest,
    status: 201,
    response: ShoppingItem,
  },
  getShoppingItem: {
    method: "GET",
    path: SHOPPING_ITEM,
    params: ShoppingItemIdParams,
    status: 200,
    response: ShoppingItem,
  },
  updateShoppingItem: {
    method: "PATCH",
    path: SHOPPING_ITEM,
    params: ShoppingItemIdParams,
    body: UpdateShoppingItemRequest,
    status: 200,
    response: ShoppingItem,
  },
  deleteShoppingItem: {
    method: "DELETE",
    path: SHOPPING_ITEM,
    params: ShoppingItemIdParams,
    status: 204,
    response: null,
  },
  purchaseShoppingItem: {
    method: "POST",
    path: `${SHOPPING_ITEM}/purchase`,
    params: ShoppingItemIdParams,
    status: 200,
    response: PurchasedShoppingItem,
  },
  unpurchaseShoppingItem: {
    method: "POST",
    path: `${SHOPPING_ITEM}/unpurchase`,
    params: ShoppingItemIdParams,
    status: 200,
    response: UnpurchasedShoppingItem,
  },
  clearPurchasedShoppingItems: {
    method: "POST",
    path: `${HOUSEHOLD}/shopping-items/clear-purchased`,
    params: HouseholdIdParams,
    status: 200,
    response: ClearPurchasedShoppingItemsResponse,
  },
} as const satisfies Record<string, Endpoint>;
