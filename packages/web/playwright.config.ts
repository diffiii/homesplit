import { defineConfig, devices } from "@playwright/test";
import { baseConfig, NEXT_E2E_ENV } from "./e2e/base-config";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests against the mock API, at a 360 px phone and a desktop
 * viewport. Playwright starts `next dev` with the mocks on a port of its own.
 */
export default defineConfig({
  ...baseConfig,
  testDir: "e2e/mocks",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `msw init public --no-save && next dev --port ${PORT}`,
    url: `${baseURL}/sign-in`,
    env: { ...NEXT_E2E_ENV, NEXT_PUBLIC_API_MOCKS: "true" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
