import type { EndpointName, Endpoints } from "@homesplit/contracts";
import type { ApiInput } from "./client";

/** Endpoints that read data, the only ones that get query keys. */
export type QueryEndpointName = {
  [N in EndpointName]: Endpoints[N]["method"] extends "GET" ? N : never;
}[EndpointName];

/** Better Auth reads scoped to one household. */
export type HouseholdAuthQuery = "get" | "listMembers" | "listInvitations";

type KeyInput<N extends QueryEndpointName> = Pick<
  ApiInput<N>,
  "params" | "query"
>;

/** Like `ApiArgs`: the input may be left out when the route has no params. */
type KeyArgs<N extends QueryEndpointName> =
  object extends ApiInput<N> ? [input?: KeyInput<N>] : [input: KeyInput<N>];

/**
 * Every query key in the app. Keys scoped to a household start with
 * `household(householdId)`, so invalidating that prefix refetches everything
 * shown for it; user-level keys start with `me()`.
 */
export const queryKeys = {
  /** Households the user belongs to, from Better Auth. */
  households: () => ["households"] as const,

  household: (householdId: string) => ["household", householdId] as const,

  householdAuth: (householdId: string, query: HouseholdAuthQuery) =>
    [...queryKeys.household(householdId), "auth", query] as const,

  invitation: (invitationId: string) => ["invitation", invitationId] as const,

  me: () => ["me"] as const,

  /** The user's signed-in devices, from Better Auth. */
  sessions: () => [...queryKeys.me(), "auth", "sessions"] as const,

  /**
   * `[scope, name, params?, query?]` for an endpoint from the contracts map.
   * `params` holds the path params other than `householdId` and appears only
   * when the route has some. Leave out `query` to get the prefix of every
   * variant, such as all pages of a list.
   */
  endpoint: <N extends QueryEndpointName>(
    name: N,
    ...[input]: KeyArgs<N>
  ): readonly unknown[] => {
    const { householdId, ...params } = (input?.params ?? {}) as Record<
      string,
      unknown
    >;
    // Household routes are exactly the ones with a `householdId` param.
    const key: unknown[] =
      typeof householdId === "string"
        ? [...queryKeys.household(householdId), name]
        : [...queryKeys.me(), name];
    if (Object.keys(params).length > 0) {
      key.push(params);
    }
    if (input?.query !== undefined) {
      key.push(input.query);
    }
    return key;
  },
};
