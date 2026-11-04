import type { HouseholdFeatures } from "@homesplit/contracts";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ApiRequestError } from "./api-error";
import { createApiClient } from "./client";

const HOUSEHOLD_ID = "0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c";
const CHORE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const FEATURES = { expenses: true, chores: false, shopping: true, ai: false };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response)
  );
  const onUnauthenticated = vi.fn();
  const api = createApiClient({ fetch, onUnauthenticated });
  return { api, fetch, onUnauthenticated };
}

describe("createApiClient", () => {
  it("builds the path and encodes the query with the contract codecs", async () => {
    const { api, fetch } = setup(
      json(200, { items: [], page: 2, pageSize: 20, totalItems: 0 })
    );
    await api("listChores", {
      params: { householdId: HOUSEHOLD_ID },
      query: { page: 2, includeCompleted: true },
    });
    expect(fetch).toHaveBeenCalledWith(
      `/api/households/${HOUSEHOLD_ID}/chores?page=2&includeCompleted=true`,
      expect.objectContaining({ method: "GET", body: undefined })
    );
  });

  it("sends the body as JSON and returns the parsed response", async () => {
    const { api, fetch } = setup(json(200, FEATURES));
    const features = await api("updateHouseholdFeatures", {
      params: { householdId: HOUSEHOLD_ID },
      body: { chores: false },
    });
    expect(features).toEqual(FEATURES);
    expectTypeOf(features).toEqualTypeOf<HouseholdFeatures>();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chores: false }),
    });
  });

  it("returns undefined for 204 routes", async () => {
    const { api } = setup(new Response(null, { status: 204 }));
    await expect(
      api("deleteChore", {
        params: { householdId: HOUSEHOLD_ID, choreId: CHORE_ID },
      })
    ).resolves.toBeUndefined();
  });

  it("reports a response that doesn't match its schema", async () => {
    const { api } = setup(json(200, { expenses: "yes" }));
    await expect(
      api("getHouseholdFeatures", { params: { householdId: HOUSEHOLD_ID } })
    ).rejects.toMatchObject({
      source: "api",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });

  it("throws error answers as ApiRequestError", async () => {
    const { api, onUnauthenticated } = setup(
      json(409, { code: "CATEGORY_IN_USE", message: "Category in use" })
    );
    const error = await api("getHouseholdFeatures", {
      params: { householdId: HOUSEHOLD_ID },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      source: "api",
      status: 409,
      code: "CATEGORY_IN_USE",
    });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("calls onUnauthenticated on a 401", async () => {
    const { api, onUnauthenticated } = setup(
      json(401, { code: "UNAUTHENTICATED", message: "Authentication required" })
    );
    await expect(api("listFriendships")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it("reports a failed fetch as a network error", async () => {
    const { api } = setup(new TypeError("Failed to fetch"));
    await expect(api("listFriendships")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
  });

  it("lets an abort through unchanged", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    const { api } = setup(abort);
    const controller = new AbortController();
    controller.abort();
    await expect(
      api("listFriendships", { signal: controller.signal })
    ).rejects.toBe(abort);
  });

  it("types the input after the endpoint", () => {
    const { api } = setup(json(200, FEATURES));
    // Never called: the checks are the @ts-expect-error lines.
    const typeChecks = () => [
      // @ts-expect-error householdId is required
      api("getHouseholdFeatures"),
      // @ts-expect-error the route takes no body
      api("listFriendships", { body: {} }),
      api("listChores", {
        params: { householdId: HOUSEHOLD_ID },
        // @ts-expect-error page is a number
        query: { page: "2" },
      }),
    ];
    expect(typeChecks).toBeTypeOf("function");
  });
});
