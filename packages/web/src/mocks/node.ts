import { setupServer } from "msw/node";
import { MockDb } from "./db";
import { createHandlers } from "./handlers";
import { DEFAULT_SCENARIO, SCENARIOS, type ScenarioName } from "./scenarios";

/**
 * An MSW server for tests, backed by a fresh copy of `scenario`. Change the
 * data through `db`, or override a route for one test with `server.use(...)`.
 *
 * ```ts
 * const { server, db } = setupMockServer();
 * beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 * ```
 */
export function setupMockServer(scenario: ScenarioName = DEFAULT_SCENARIO) {
  const db = new MockDb(SCENARIOS[scenario].build());
  const server = setupServer(...createHandlers(db));
  return { db, server };
}
