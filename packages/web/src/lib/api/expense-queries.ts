import { infiniteQueryOptions } from "@tanstack/react-query";
import type { ExpenseFilters } from "@/lib/expenses";
import { api } from "./client";
import { endpointQuery } from "./queries";
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

/** Payments loaded per page as the history scrolls. */
export const SETTLEMENT_PAGE_SIZE = 20;

/** Every page of the payment history loaded so far, under `listSettlements` like the expense list. */
export function settlementHistoryQuery(householdId: string) {
  return infiniteQueryOptions({
    queryKey: [
      ...queryKeys.endpoint("listSettlements", { params: { householdId } }),
      "infinite",
    ],
    queryFn: ({ pageParam, signal }) =>
      api("listSettlements", {
        params: { householdId },
        query: { page: pageParam, pageSize: SETTLEMENT_PAGE_SIZE },
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: ({ page, pageSize, totalItems }) =>
      page * pageSize < totalItems ? page + 1 : undefined,
  });
}

/** The newest pending payments, up to the API's largest page: few are pending at once. */
export function pendingSettlementsQuery(householdId: string) {
  return endpointQuery("listSettlements", {
    params: { householdId },
    query: { status: "pending", pageSize: 100 },
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

/** What recording a payment changes: the balances, the payments that would settle them, and the history. */
export function settlementQueryKeys(householdId: string) {
  const input = { params: { householdId } };
  return [
    queryKeys.endpoint("listBalances", input),
    queryKeys.endpoint("listSettlementSuggestions", input),
    queryKeys.endpoint("listSettlements", input),
  ];
}
