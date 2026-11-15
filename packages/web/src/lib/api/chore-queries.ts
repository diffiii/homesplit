import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "./client";
import { queryKeys } from "./query-keys";

const CHORE_PAGE_SIZE = 20;

export const CHORE_POLL_INTERVAL = 60_000;

export function choreListQuery(
  householdId: string,
  query: { assignedToId?: string; includeCompleted: boolean }
) {
  return infiniteQueryOptions({
    queryKey: [
      ...queryKeys.endpoint("listChores", { params: { householdId }, query }),
      "infinite",
    ],
    queryFn: ({ pageParam, signal }) =>
      api("listChores", {
        params: { householdId },
        query: { ...query, page: pageParam, pageSize: CHORE_PAGE_SIZE },
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: ({ page, pageSize, totalItems }) =>
      page * pageSize < totalItems ? page + 1 : undefined,
    // A poll refetches every loaded page, so it stops once the list is long.
    refetchInterval: ({ state }) =>
      (state.data?.pages.length ?? 1) > 1 ? false : CHORE_POLL_INTERVAL,
  });
}
