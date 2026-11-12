import type { ShoppingItem } from "@homesplit/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import { queryKeys } from "./query-keys";

const SHOPPING_PAGE_SIZE = 100;

export const SHOPPING_POLL_INTERVAL = 10_000;

export function shoppingListQuery(householdId: string, { poll = true } = {}) {
  return queryOptions({
    queryKey: [
      ...queryKeys.endpoint("listShoppingItems", { params: { householdId } }),
      "all",
    ],
    queryFn: async ({ signal }) => {
      const items = new Map<string, ShoppingItem>();
      let page = 1;
      let more = true;
      while (more) {
        // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous one's total
        const result = await api("listShoppingItems", {
          params: { householdId },
          query: { page, pageSize: SHOPPING_PAGE_SIZE, includePurchased: true },
          signal,
        });
        for (const item of result.items) {
          items.set(item.id, item);
        }
        more =
          result.items.length > 0 && page * result.pageSize < result.totalItems;
        page += 1;
      }
      return [...items.values()];
    },
    refetchInterval: poll ? SHOPPING_POLL_INTERVAL : false,
  });
}

export const createShoppingItemKey = (householdId: string) =>
  [...queryKeys.household(householdId), "createShoppingItem"] as const;

export const shoppingActionKey = (householdId: string) =>
  [...queryKeys.household(householdId), "shoppingAction"] as const;
