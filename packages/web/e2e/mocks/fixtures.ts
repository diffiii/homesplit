import { test as base } from "@playwright/test";
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  type ScenarioName,
} from "../../src/mocks/scenarios";
import {
  MOCK_STORAGE_KEY,
  MOCK_STORAGE_VERSION,
  type SavedMocks,
} from "../../src/mocks/storage";

export interface MockOptions {
  /** The data the mock API starts from. Pick another with `test.use({ scenario })`. */
  scenario: ScenarioName;
}

/**
 * Playwright's `test`, with each test's browser mocks starting from a fresh
 * copy of `scenario`, answering without latency.
 */
export const test = base.extend<MockOptions>({
  scenario: [DEFAULT_SCENARIO, { option: true }],
  page: async ({ page, scenario }, use) => {
    const saved: SavedMocks = {
      version: MOCK_STORAGE_VERSION,
      scenario,
      network: { failure: "none", latency: "none" },
      state: SCENARIOS[scenario].build(),
    };
    // Seed the mocks before the first page load. Later loads find the data
    // the test has changed since, and keep it.
    await page.addInitScript(
      ([key, value]) => {
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, value);
        }
      },
      [MOCK_STORAGE_KEY, JSON.stringify(saved)] as const
    );
    await use(page);
  },
});
