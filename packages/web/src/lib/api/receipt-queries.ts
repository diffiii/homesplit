import { queryOptions } from "@tanstack/react-query";
import { receiptPollDelay } from "@/lib/receipts";
import { endpointQuery } from "./queries";
import { queryKeys } from "./query-keys";

/** Receipts the list loads: the drafts of one household rarely come near it. */
const RECEIPT_LIST_SIZE = 100;

/** How often the list checks on receipts still being read. */
export const RECEIPT_LIST_POLL_MS = 5000;

/**
 * One receipt, asked about again while it's `processing`, sooner at first and
 * then less often (`receiptPollDelay`), and not at all once it's read.
 */
export function receiptQuery(householdId: string, receiptId: string) {
  return queryOptions({
    ...endpointQuery("getReceipt", { params: { householdId, receiptId } }),
    refetchInterval: ({ state }) =>
      state.data?.status === "processing"
        ? receiptPollDelay(state.dataUpdateCount)
        : false,
  });
}

/** The newest receipts, checked again every few seconds while any is being read. */
export function receiptListQuery(householdId: string) {
  return queryOptions({
    ...endpointQuery("listReceipts", {
      params: { householdId },
      query: { page: 1, pageSize: RECEIPT_LIST_SIZE },
    }),
    refetchInterval: ({ state }) =>
      state.data?.items.some(({ status }) => status === "processing")
        ? RECEIPT_LIST_POLL_MS
        : false,
  });
}

/** What scanning, editing, or discarding a receipt changes: the list, in every variant. */
export function receiptListKey(householdId: string) {
  return queryKeys.endpoint("listReceipts", { params: { householdId } });
}
