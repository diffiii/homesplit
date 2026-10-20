import type { PlaywrightTestConfig } from "@playwright/test";

/** What the mock and the backend configs share. */
export const baseConfig = {
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // `next dev` compiles each route on its first request.
  expect: { timeout: 10_000 },
} satisfies PlaywrightTestConfig;

/**
 * `next dev` for a test run, in a directory of its own, since `next dev`
 * locks its directory and yours may be running.
 */
export const NEXT_E2E_ENV = { NEXT_DIST_DIR: ".next-e2e" };
