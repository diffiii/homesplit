import { attachmentEndpoints } from "./attachments";
import { choreEndpoints } from "./chores";
import type { Endpoint } from "./endpoint";
import { expenseEndpoints } from "./expenses";
import { householdEndpoints } from "./households";
import { invitationEndpoints } from "./invitations";
import { meEndpoints } from "./me";
import { receiptEndpoints } from "./receipts";
import { shoppingEndpoints } from "./shopping";

export * from "./endpoint";
export * from "./url";

/**
 * Every application route under `/api`, except Better Auth's `/api/auth/*`.
 * Backend handlers take their method, path, and status from here through `@Route`.
 */
export const endpoints = {
  ...householdEndpoints,
  ...invitationEndpoints,
  ...expenseEndpoints,
  ...attachmentEndpoints,
  ...receiptEndpoints,
  ...choreEndpoints,
  ...shoppingEndpoints,
  ...meEndpoints,
} as const satisfies Record<string, Endpoint>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

/**
 * Endpoints whose answer a client reads, for `api()` and the web mocks. A
 * 302 route leads a browser to content elsewhere, so it isn't one.
 */
export type ApiEndpointName = {
  [N in EndpointName]: Endpoints[N] extends { status: 302 } ? never : N;
}[EndpointName];
