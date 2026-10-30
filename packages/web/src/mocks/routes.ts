import {
  type Endpoint,
  type EndpointName,
  type Endpoints,
  endpoints,
  type FeatureId,
  Id,
  type ResponseBody,
} from "@homesplit/contracts";
import { delay, type HttpHandler, HttpResponse, http } from "msw";
import type { z } from "zod";
import type { HouseholdRole } from "@/lib/api/auth-client";
import type { MockDb, MockHousehold, MockMember } from "./db";
import {
  badRequest,
  forbidden,
  MockApiError,
  notFound,
  toIssues,
  unauthenticated,
  validationError,
} from "./errors";

const ROLE_RANK: Record<HouseholdRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export function hasRole(role: HouseholdRole, minRole: HouseholdRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

type Parsed<E, K extends "params" | "query" | "body"> = E extends {
  [P in K]: infer S extends z.ZodType;
}
  ? z.output<S>
  : undefined;

/** The household and the caller's membership, for routes under `/api/households/:householdId`. */
interface HouseholdScope {
  household: MockHousehold;
  member: MockMember;
}

type HasHouseholdParam<E> = E extends {
  params: z.ZodObject<infer Shape>;
}
  ? "householdId" extends keyof Shape
    ? true
    : false
  : false;

/** What a resolver gets: the parsed request, the caller, and for household routes their membership. */
export type MockRequest<E extends Endpoint> = {
  body: Parsed<E, "body">;
  db: MockDb;
  /** The `multipart/form-data` body, for endpoints without a body schema that take one. */
  form: FormData | undefined;
  params: Parsed<E, "params">;
  query: Parsed<E, "query">;
  /** The session user. */
  userId: string;
} & (HasHouseholdParam<E> extends true ? HouseholdScope : unknown);

export interface MockRoute<E extends Endpoint> {
  /** Route-level role, checked after membership; `member` by default. */
  minRole?: HouseholdRole;
  /** Writes answer 403 `MODULE_DISABLED` while this module is off. */
  module?: FeatureId;
  /**
   * The success body, which is checked against the endpoint's response
   * schema. Throw a `MockApiError` for an error answer.
   */
  resolve: (request: MockRequest<E>) => ResponseBody<E>;
}

/** Mock implementations by endpoint name. A route left out answers 501 and logs an error. */
export type MockRoutes = {
  [N in EndpointName]?: MockRoute<Endpoints[N]>;
};

/** Simulated network conditions for the application routes, switchable on `/dev/mocks`. */
export interface MockNetwork {
  failure: "none" | "server-error" | "offline";
  latency: "none" | "realistic" | "slow";
}

export const DEFAULT_NETWORK: MockNetwork = {
  failure: "none",
  latency: "realistic",
};

const SLOW_MS = 3000;

export async function simulateLatency({ latency }: MockNetwork) {
  if (latency === "realistic") {
    await delay("real");
  } else if (latency === "slow") {
    await delay(SLOW_MS);
  }
}

type AnyRoute = MockRoute<Endpoint>;
type AnyResolve = (request: Record<string, unknown>) => unknown;

/**
 * One MSW handler per endpoint in the contracts map, plus a catch-all that
 * answers 404 like the backend. Each handler runs the backend's checks in
 * its order (docs/decisions.md, "Errors"): session, household membership,
 * module, role, then the endpoint's schemas, before calling the resolver.
 */
export function createApiHandlers(
  db: MockDb,
  routes: MockRoutes,
  network: () => MockNetwork = () => ({ ...DEFAULT_NETWORK, latency: "none" })
): HttpHandler[] {
  const handlers = Object.entries(endpoints).map(([name, endpoint]) => {
    const route = routes[name as EndpointName] as AnyRoute | undefined;
    const method = endpoint.method.toLowerCase() as Lowercase<
      Endpoint["method"]
    >;
    return http[method](`*${endpoint.path}`, async ({ request, params }) => {
      if (!route) {
        return notImplemented(name, endpoint);
      }
      const conditions = network();
      await simulateLatency(conditions);
      if (conditions.failure === "offline") {
        return HttpResponse.error();
      }
      if (conditions.failure === "server-error") {
        return new MockApiError(
          500,
          "INTERNAL_ERROR",
          "Simulated server error"
        ).toResponse();
      }
      try {
        const response = await respond(
          db,
          endpoint,
          route,
          request,
          params as Record<string, string>
        );
        if (endpoint.method !== "GET") {
          db.changed();
        }
        return response;
      } catch (error) {
        return errorResponse(name, error);
      }
    });
  });

  return [
    ...handlers,
    http.all("*/api/*", ({ request }) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/api/auth/")) {
        return;
      }
      return notFound().toResponse();
    }),
  ];
}

async function respond(
  db: MockDb,
  endpoint: Endpoint,
  route: AnyRoute,
  request: Request,
  rawParams: Record<string, string>
): Promise<Response> {
  const userId = db.state.sessionUserId;
  if (!userId) {
    throw unauthenticated();
  }
  const scope =
    "householdId" in rawParams
      ? householdScope(db, endpoint, route, rawParams.householdId, userId)
      : {};

  const params = endpoint.params
    ? parse(endpoint.params, rawParams)
    : undefined;
  const query = endpoint.query
    ? parse(
        endpoint.query,
        Object.fromEntries(new URL(request.url).searchParams)
      )
    : undefined;
  const body = endpoint.body
    ? parseBody(endpoint.method, endpoint.body, await readJson(request))
    : undefined;
  const form = endpoint.body ? undefined : await readForm(request);

  const result = (route.resolve as AnyResolve)({
    db,
    userId,
    params,
    query,
    body,
    form,
    ...scope,
  });

  if (endpoint.response === null) {
    return new HttpResponse(null, { status: endpoint.status });
  }
  const checked = endpoint.response.safeParse(result);
  if (!checked.success) {
    throw new InvalidMockResponseError(endpoint, checked.error);
  }
  return HttpResponse.json(result as never, { status: endpoint.status });
}

function householdScope(
  db: MockDb,
  endpoint: Endpoint,
  route: AnyRoute,
  rawHouseholdId: string,
  userId: string
): HouseholdScope {
  const householdId = Id.safeParse(rawHouseholdId);
  if (!householdId.success) {
    throw validationError(toIssues(householdId.error, ["householdId"]));
  }
  const household = db.household(householdId.data);
  const member = household && db.member(household.id, userId);
  if (!(household && member)) {
    throw notFound();
  }
  if (
    endpoint.method !== "GET" &&
    route.module &&
    !household.features[route.module]
  ) {
    throw new MockApiError(
      403,
      "MODULE_DISABLED",
      `The ${route.module} module is disabled`,
      { module: route.module }
    );
  }
  if (!hasRole(member.role, route.minRole ?? "member")) {
    throw forbidden();
  }
  return { household, member };
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw validationError(toIssues(parsed.error));
  }
  return parsed.data;
}

function parseBody(
  method: Endpoint["method"],
  schema: z.ZodType,
  value: unknown
): unknown {
  const body = parse(schema, value);
  if (
    method === "PATCH" &&
    Object.values(body as object).every((field) => field === undefined)
  ) {
    throw badRequest("EMPTY_PATCH", "The update has no fields");
  }
  return body;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) {
    return;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw validationError([{ path: [], message: "Malformed JSON" }], {
      cause: error,
    });
  }
}

async function readForm(request: Request): Promise<FormData | undefined> {
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
    return;
  }
  try {
    return await request.formData();
  } catch (error) {
    throw validationError([{ path: [], message: "Malformed multipart body" }], {
      cause: error,
    });
  }
}

class InvalidMockResponseError extends Error {
  constructor(endpoint: Endpoint, cause: z.ZodError) {
    super(
      `Mock response for ${endpoint.method} ${endpoint.path} doesn't match its schema`,
      { cause }
    );
  }
}

function notImplemented(name: string, endpoint: Endpoint): Response {
  const message = `No mock for ${name} (${endpoint.method} ${endpoint.path}). Add one in src/mocks/handlers.`;
  console.error(`[mocks] ${message}`);
  return new MockApiError(501, "NOT_IMPLEMENTED", message).toResponse();
}

function errorResponse(name: string, error: unknown): Response {
  if (error instanceof MockApiError) {
    return error.toResponse();
  }
  console.error(`[mocks] ${name} failed`, error);
  const message =
    error instanceof InvalidMockResponseError
      ? error.message
      : "The mock handler threw";
  return new MockApiError(500, "INTERNAL_ERROR", message).toResponse();
}
