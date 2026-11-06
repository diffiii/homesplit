import { infiniteQueryOptions } from "@tanstack/react-query";
import type { ExpenseFilters } from "@/lib/expenses";
import { api } from "./client";
import { queryKeys } from "./query-keys";

/** Expenses loaded per page as the list scrolls. */
export const EXPENSE_PAGE_SIZE = 20;

/**
 * Every page of the expense list loaded so far for `filters`. The key sits
 * under `listExpenses`, so invalidating that endpoint refetches it too.
 */
export function expenseListQuery(householdId: string, filters: ExpenseFilters) {
  return infiniteQueryOptions({
    queryKey: [
      ...queryKeys.endpoint("listExpenses", {
        params: { householdId },
        query: filters,
      }),
      "infinite",
    ],
    queryFn: ({ pageParam, signal }) =>
      api("listExpenses", {
        params: { householdId },
        query: { ...filters, page: pageParam, pageSize: EXPENSE_PAGE_SIZE },
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: ({ page, pageSize, totalItems }) =>
      page * pageSize < totalItems ? page + 1 : undefined,
  });
}

/**
 * What adding, editing, or deleting an expense changes: every page and filter
 * of the list, the balances, and the payments that would settle them.
 */
export function ledgerQueryKeys(householdId: string) {
  const input = { params: { householdId } };
  return [
    queryKeys.endpoint("listExpenses", input),
    queryKeys.endpoint("listBalances", input),
    queryKeys.endpoint("listSettlementSuggestions", input),
  ];
}
