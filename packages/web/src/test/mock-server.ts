import { setupMockServer } from "@/mocks/node";
import { SCENARIOS, type ScenarioName } from "@/mocks/scenarios";

/**
 * The mock API component tests run against. `src/test/setup.ts` starts it
 * and loads the default scenario before each test. Change the data through
 * `db`, or override a route for one test with `server.use(...)`.
 */
export const { db, server } = setupMockServer();

/** Start afresh from `scenario`, dropping changes made since. */
export function loadScenario(scenario: ScenarioName): void {
  db.replace(SCENARIOS[scenario].build());
}

/** Sign in as the mock user with `email`, or sign out with `null`. */
export function signInAs(email: string | null): void {
  if (email === null) {
    db.state.sessionUserId = null;
    return;
  }
  const user = db.userByEmail(email);
  if (!user) {
    throw new Error(`The scenario has no user ${email}`);
  }
  db.state.sessionUserId = user.id;
}
