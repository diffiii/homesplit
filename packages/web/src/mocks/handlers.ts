import type { HttpHandler } from "msw";
import { attachmentRoutes, createThumbnailHandler } from "./api/attachments";
import { choreRoutes } from "./api/chores";
import { expenseRoutes } from "./api/expenses";
import { householdRoutes } from "./api/households";
import { invitationRoutes } from "./api/invitations";
import { meRoutes } from "./api/me";
import { shoppingRoutes } from "./api/shopping";
import { createAuthHandlers } from "./auth";
import type { MockDb } from "./db";
import {
  createApiHandlers,
  DEFAULT_NETWORK,
  type MockNetwork,
  type MockRoutes,
} from "./routes";

/** Every mocked application route, by endpoint name. */
export const mockRoutes: MockRoutes = {
  ...householdRoutes,
  ...invitationRoutes,
  ...expenseRoutes,
  ...attachmentRoutes,
  ...choreRoutes,
  ...shoppingRoutes,
  ...meRoutes,
};

/** MSW handlers for Better Auth and every application route, backed by `db`. */
export function createHandlers(
  db: MockDb,
  network: () => MockNetwork = () => ({ ...DEFAULT_NETWORK, latency: "none" })
): HttpHandler[] {
  return [
    ...createAuthHandlers(db, network),
    // Before the API handlers, whose own one for this path answers 501.
    createThumbnailHandler(db, network),
    ...createApiHandlers(db, mockRoutes, network),
  ];
}
