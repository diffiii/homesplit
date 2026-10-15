import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  endpointQuery,
  invalidate,
  optimistic,
  updateQueries,
} from "./queries";
import { queryKeys } from "./query-keys";

const HOUSEHOLD_ID = "0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c";
const OTHER_HOUSEHOLD_ID = "1c7f2f5e-4d2b-4c9f-8b6a-2e3f4a5b6c7d";
const CHORE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("queryKeys.endpoint", () => {
  it("scopes household routes by household and user routes by me", () => {
    expect(
      queryKeys.endpoint("getChore", {
        params: { householdId: HOUSEHOLD_ID, choreId: CHORE_ID },
      })
    ).toEqual(["household", HOUSEHOLD_ID, "getChore", { choreId: CHORE_ID }]);
    expect(
      queryKeys.endpoint("listChores", {
        params: { householdId: HOUSEHOLD_ID },
        query: { page: 2 },
      })
    ).toEqual(["household", HOUSEHOLD_ID, "listChores", { page: 2 }]);
    expect(queryKeys.endpoint("listFriendships")).toEqual([
      "me",
      "listFriendships",
    ]);
  });

  it("puts every household key under the household prefix", () => {
    const household = queryKeys.household(HOUSEHOLD_ID);
    for (const key of [
      queryKeys.endpoint("getHouseholdFeatures", {
        params: { householdId: HOUSEHOLD_ID },
      }),
      queryKeys.householdAuth(HOUSEHOLD_ID, "listMembers"),
    ]) {
      expect(key.slice(0, household.length)).toEqual(household);
    }
  });

  it("matches endpointQuery's key", () => {
    const input = { params: { householdId: HOUSEHOLD_ID }, query: { page: 1 } };
    expect(endpointQuery("listChores", input).queryKey).toEqual(
      queryKeys.endpoint("listChores", input)
    );
  });
});

describe("updateQueries", () => {
  it("updates every page of a list and rolls back to the snapshot", async () => {
    const client = new QueryClient();
    const lists = queryKeys.endpoint("listChores", {
      params: { householdId: HOUSEHOLD_ID },
    });
    client.setQueryData([...lists, { page: 1 }], [1, 2]);
    client.setQueryData([...lists, { page: 2 }], [3]);

    const rollback = await updateQueries<number[]>(client, lists, (items) =>
      items.map((n) => n * 10)
    );
    expect(client.getQueryData([...lists, { page: 1 }])).toEqual([10, 20]);
    expect(client.getQueryData([...lists, { page: 2 }])).toEqual([30]);

    rollback();
    expect(client.getQueryData([...lists, { page: 1 }])).toEqual([1, 2]);
    expect(client.getQueryData([...lists, { page: 2 }])).toEqual([3]);
  });
});

describe("optimistic", () => {
  it("patches the cache, rolls back on error, and invalidates when settled", async () => {
    const client = new QueryClient();
    const key = queryKeys.endpoint("getHouseholdFeatures", {
      params: { householdId: HOUSEHOLD_ID },
    });
    const related = queryKeys.householdAuth(HOUSEHOLD_ID, "get");
    const unrelated = queryKeys.household(OTHER_HOUSEHOLD_ID);
    client.setQueryData(key, { chores: true });
    client.setQueryData(related, { name: "Flat" });
    client.setQueryData(unrelated, { name: "Other" });

    const callbacks = optimistic<boolean, { chores: boolean }>({
      queryKey: () => key,
      update: (features, chores) => ({ ...features, chores }),
      invalidates: () => [related],
    });
    const context = { client, meta: undefined, mutationKey: undefined };

    const result = await callbacks.onMutate(false, context);
    expect(client.getQueryData(key)).toEqual({ chores: false });

    callbacks.onError(new Error("failed"), false, result);
    expect(client.getQueryData(key)).toEqual({ chores: true });

    await callbacks.onSettled(undefined, null, false, result, context);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(related)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  });
});

describe("invalidate", () => {
  it("invalidates everything under each key", async () => {
    const client = new QueryClient();
    const chore = queryKeys.endpoint("getChore", {
      params: { householdId: HOUSEHOLD_ID, choreId: CHORE_ID },
    });
    client.setQueryData(chore, {});
    await invalidate(client, [queryKeys.household(HOUSEHOLD_ID)]);
    expect(client.getQueryState(chore)?.isInvalidated).toBe(true);
  });
});
