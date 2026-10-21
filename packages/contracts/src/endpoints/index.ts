import { attachmentEndpoints } from "./attachments";
import { choreEndpoints } from "./chores";
import type { Endpoint } from "./endpoint";
import { expenseEndpoints } from "./expenses";
import { householdEndpoints } from "./households";
import { meEndpoints } from "./me";
import { shoppingEndpoints } from "./shopping";

// biome-ignore lint/performance/noBarrelFile: package entry point
export * from "./endpoint";
export * from "./url";

/**
 * Every application route under `/api`, except Better Auth's `/api/auth/*`.
 * Backend handlers take their method, path, and status from here through `@Route`.
 */
export const endpoints = {
  ...householdEndpoints,
  ...expenseEndpoints,
  ...attachmentEndpoints,
  ...choreEndpoints,
  ...shoppingEndpoints,
  ...meEndpoints,
} as const satisfies Record<string, Endpoint>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
