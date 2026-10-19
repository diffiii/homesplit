import { queryOptions } from "@tanstack/react-query";
import { households } from "./auth-client";
import { queryKeys } from "./query-keys";

/** Query options for the Better Auth household reads, so every screen shares one cache entry. */
export const householdQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.households(),
      queryFn: async () => (await households.list()) ?? [],
    }),

  members: (householdId: string) =>
    queryOptions({
      queryKey: queryKeys.householdAuth(householdId, "listMembers"),
      queryFn: async () =>
        (await households.listMembers({ householdId }))?.members ?? [],
    }),
};
