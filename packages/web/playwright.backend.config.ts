import { defineConfig, devices } from "@playwright/test";
import { baseConfig, NEXT_E2E_ENV, WARM_UP_PROJECT } from "./e2e/base-config";

const WEB_PORT = 3200;
const API_PORT = 8180;
const baseURL = `http://localhost:${WEB_PORT}`;
const apiURL = `http://localhost:${API_PORT}`;

// The backend tests' throwaway database (`pnpm db:test:up`), never the
// development one. Tests sign up users of their own, so they need no seed.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/homesplit_test";

if (!new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    `Refusing to run tests against ${databaseUrl}: database name must end in _test`
  );
}

/**
 * End-to-end tests against the real backend and database. Playwright
 * migrates the database, then starts the backend and `next dev` on ports of
 * their own.
 */
export default defineConfig({
  ...baseConfig,
  testDir: "e2e/backend",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    WARM_UP_PROJECT,
    {
      name: "backend",
      dependencies: [WARM_UP_PROJECT.name],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      name: "backend",
      command:
        "pnpm --filter backend db:migrate && pnpm --filter backend start",
      url: apiURL,
      env: {
        DATABASE_URL: databaseUrl,
        PORT: String(API_PORT),
        BETTER_AUTH_SECRET: "e2e-secret-not-for-production-use-0123456789",
        FRONTEND_URL: baseURL,
        FRONTEND_PREVIEW_ORIGINS: "",
        STORAGE_DRIVER: "memory",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      name: "web",
      command: `next dev --port ${WEB_PORT}`,
      url: `${baseURL}/sign-in`,
      env: { ...NEXT_E2E_ENV, API_URL: apiURL, NEXT_PUBLIC_API_MOCKS: "false" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
