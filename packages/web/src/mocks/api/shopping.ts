import type {
  PurchasedShoppingItem,
  ShoppingItem,
  UnpurchasedShoppingItem,
} from "@homesplit/contracts";
import { type MockDb, type MockShoppingItem, now } from "../db";
import type { MockRoutes } from "../routes";
import {
  asc,
  definedFields,
  findInHousehold,
  paginate,
  removeRow,
  sortBy,
} from "./shared";

export function renderShoppingItem(
  db: MockDb,
  item: MockShoppingItem
): ShoppingItem {
  const base = {
    id: item.id,
    householdId: item.householdId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    addedBy: db.summary(item.addedById),
    addedAt: item.addedAt,
  };
  if (item.purchasedAt && item.purchasedById) {
    return {
      ...base,
      isPurchased: true,
      purchasedBy: db.summary(item.purchasedById),
      purchasedAt: item.purchasedAt,
    };
  }
  return { ...base, isPurchased: false, purchasedBy: null, purchasedAt: null };
}

const itemsOf = (db: MockDb, householdId: string) =>
  db.state.shoppingItems.filter((item) => item.householdId === householdId);

export const shoppingRoutes: MockRoutes = {
  listShoppingItems: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          itemsOf(db, household.id).filter(
            (item) => query.includePurchased || !item.purchasedAt
          ),
          asc((item) => item.purchasedAt !== null),
          asc((item) => item.addedAt),
          asc((item) => item.id)
        ),
        query,
        (item) => renderShoppingItem(db, item)
      ),
  },

  createShoppingItem: {
    module: "shopping",
    resolve: ({ db, household, userId, body }) => {
      const item: MockShoppingItem = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name: body.name,
        quantity: body.quantity,
        unit: body.unit ?? null,
        addedById: userId,
        addedAt: now(),
        purchasedAt: null,
        purchasedById: null,
      };
      db.state.shoppingItems.push(item);
      return renderShoppingItem(db, item);
    },
  },

  getShoppingItem: {
    resolve: ({ db, household, params }) =>
      renderShoppingItem(
        db,
        findInHousehold(db.state.shoppingItems, household.id, params.itemId)
      ),
  },

  updateShoppingItem: {
    module: "shopping",
    resolve: ({ db, household, params, body }) => {
      const item = findInHousehold(
        db.state.shoppingItems,
        household.id,
        params.itemId
      );
      Object.assign(item, definedFields(body));
      return renderShoppingItem(db, item);
    },
  },

  deleteShoppingItem: {
    module: "shopping",
    resolve: ({ db, household, params }) => {
      removeRow(
        db.state.shoppingItems,
        findInHousehold(db.state.shoppingItems, household.id, params.itemId)
      );
    },
  },

  // Both actions are idempotent: a repeat keeps the original buyer and time.
  purchaseShoppingItem: {
    module: "shopping",
    resolve: ({ db, household, userId, params }) => {
      const item = findInHousehold(
        db.state.shoppingItems,
        household.id,
        params.itemId
      );
      if (!item.purchasedAt) {
        item.purchasedAt = now();
        item.purchasedById = userId;
      }
      return renderShoppingItem(db, item) as PurchasedShoppingItem;
    },
  },

  unpurchaseShoppingItem: {
    module: "shopping",
    resolve: ({ db, household, params }) => {
      const item = findInHousehold(
        db.state.shoppingItems,
        household.id,
        params.itemId
      );
      item.purchasedAt = null;
      item.purchasedById = null;
      return renderShoppingItem(db, item) as UnpurchasedShoppingItem;
    },
  },

  clearPurchasedShoppingItems: {
    module: "shopping",
    resolve: ({ db, household }) => {
      const purchased = itemsOf(db, household.id).filter(
        (item) => item.purchasedAt
      );
      db.state.shoppingItems = db.state.shoppingItems.filter(
        (item) => !purchased.includes(item)
      );
      return { deletedCount: purchased.length };
    },
  },
};
