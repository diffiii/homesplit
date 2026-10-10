import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { Expense } from "../features/expenses";
import { type Endpoint, endpoints, type ResponseBody } from ".";
import { buildPath, encodeQuery } from "./url";

const HOUSEHOLD_ID = "0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c";
const EXPENSE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const AUTH_PATH = /^\/api\/auth(\/|$)/;
const PARAM_SEGMENT = /:(\w+)/g;

const entries: [string, Endpoint][] = Object.entries(endpoints);

const pathParamNames = (path: string) =>
  [...path.matchAll(PARAM_SEGMENT)].map(([, name]) => name).sort();

describe("endpoints", () => {
  it("has one entry per method and path", () => {
    const routes = entries.map(([, { method, path }]) => `${method} ${path}`);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("keeps every path outside Better Auth", () => {
    for (const [name, { path }] of entries) {
      expect(path, name).not.toMatch(AUTH_PATH);
    }
  });

  it("names path params after the keys of the params schema", () => {
    for (const [name, { path, params }] of entries) {
      expect(pathParamNames(path), name).toEqual(
        Object.keys(params?.shape ?? {}).sort()
      );
    }
  });
});

describe("buildPath", () => {
  it("substitutes and encodes params", () => {
    expect(
      buildPath(endpoints.getExpense, {
        householdId: HOUSEHOLD_ID,
        expenseId: EXPENSE_ID,
      })
    ).toBe(`/api/households/${HOUSEHOLD_ID}/expenses/${EXPENSE_ID}`);
    expect(
      buildPath(endpoints.getHouseholdFeatures, { householdId: "a/b c" })
    ).toBe("/api/households/a%2Fb%20c/features");
    expect(buildPath(endpoints.updateProfile)).toBe("/api/me");
  });

  it("requires exactly the params the route declares", () => {
    expect(() =>
      // @ts-expect-error expenseId is missing
      buildPath(endpoints.getExpense, { householdId: HOUSEHOLD_ID })
    ).toThrow('Missing path param "expenseId"');
    // @ts-expect-error the route has no params
    buildPath(endpoints.updateProfile, { householdId: HOUSEHOLD_ID });
  });
});

describe("encodeQuery", () => {
  it("round-trips every query schema in the map", () => {
    for (const [name, endpoint] of entries) {
      if (!endpoint.query) {
        continue;
      }
      const decoded = endpoint.query.parse({});
      const search = encodeQuery(
        endpoint as Endpoint & { query: z.ZodObject },
        decoded
      );
      expect(endpoint.query.parse(search), name).toEqual(decoded);
    }
  });

  it("encodes only the given typed values", () => {
    expect(
      encodeQuery(endpoints.listChores, { page: 2, includeCompleted: true })
    ).toEqual({ page: "2", includeCompleted: "true" });
    expect(encodeQuery(endpoints.listExpenses, {})).toEqual({});
    // @ts-expect-error page is a number, not a string
    expect(() => encodeQuery(endpoints.listExpenses, { page: "2" })).toThrow();
  });
});

describe("ResponseBody", () => {
  it("is the parsed response, or undefined for 204 routes", () => {
    expectTypeOf<
      ResponseBody<typeof endpoints.getExpense>
    >().toEqualTypeOf<Expense>();
    expectTypeOf<
      ResponseBody<typeof endpoints.deleteExpense>
    >().toEqualTypeOf<undefined>();
  });

  it("distributes over a union of endpoints", () => {
    expectTypeOf<
      ResponseBody<typeof endpoints.getExpense | typeof endpoints.deleteExpense>
    >().toEqualTypeOf<Expense | undefined>();
  });
});
