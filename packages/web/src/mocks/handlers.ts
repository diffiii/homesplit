import type { HttpHandler } from "msw";
import { choreRoutes } from "./api/chores";
import { expenseRoutes } from "./api/expenses";
import { householdRoutes } from "./api/households";
import { meRoutes } from "./api/me";
import { shoppingRoutes } from "./api/shopping";
import { createAuthHandlers } from "./auth";
import type { MockDb } from "./db";
import { createApiHandlers, type MockNetwork, type MockRoutes } from "./routes";

/** Every mocked application route, by endpoint name. */
export const mockRoutes: MockRoutes = {
  ...householdRoutes,
  ...expenseRoutes,
  ...choreRoutes,
  ...shoppingRoutes,
  ...meRoutes,
};

/** MSW handlers for Better Auth and every application route, backed by `db`. */
export function createHandlers(
  db: MockDb,
  network?: () => MockNetwork
): HttpHandler[] {
  return [
    ...createAuthHandlers(db, network),
    ...createApiHandlers(db, mockRoutes, network),
  ];
}
