import { queryOptions } from "@tanstack/react-query";
import { isApiRequestError } from "./api-error";
import { households } from "./auth-client";
import { queryKeys } from "./query-keys";

/** Better Auth's answers for a household that's gone or that the caller isn't in. */
const NOT_A_MEMBER_CODES: ReadonlySet<string> = new Set([
  "ORGANIZATION_NOT_FOUND",
  "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
  "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
]);

/**
 * The household doesn't exist or the caller isn't a member: household routes
 * answer 404 to non-members, and Better Auth answers with its own codes.
 */
export function isHouseholdNotFound(error: unknown): boolean {
  return (
    isApiRequestError(error) &&
    (error.status === 404 ||
      (error.source === "auth" && NOT_A_MEMBER_CODES.has(error.code)))
  );
}

/** Query options for the Better Auth household reads, so every screen shares one cache entry. */
export const householdQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.households(),
      queryFn: async () => (await households.list()) ?? [],
    }),

  /** The household with its current members and invitations. */
  get: (householdId: string) =>
    queryOptions({
      queryKey: queryKeys.householdAuth(householdId, "get"),
      queryFn: async () => {
        const household = await households.get({ householdId });
        // Better Auth answers `null` only without an ID, which never happens here.
        if (!household) {
          throw new Error(`Household ${householdId} came back empty`);
        }
        return household;
      },
    }),
};

export type HouseholdDetails = NonNullable<
  Awaited<ReturnType<typeof households.get>>
>;
export type HouseholdMember = HouseholdDetails["members"][number];
