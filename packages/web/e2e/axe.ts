import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { AXE_TAGS, describeViolation } from "../src/test/axe-rules";

// Colors measured mid-transition would be neither theme's.
const NO_MOTION =
  "*, *::before, *::after { transition: none !important; animation: none !important; }";

/**
 * Fail the test if axe finds WCAG 2.2 AA or best-practice violations on the
 * page in dark mode or in light mode, so contrast is checked in both. Leaves
 * the page in light mode, the default.
 */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  await page.addStyleTag({ content: NO_MOTION });
  for (const colorScheme of ["dark", "light"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: the schemes take turns on one page
    await page.emulateMedia({ colorScheme });
    // The theme follows the system once the app sees the media query change.
    await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
    const { violations } = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .analyze();
    expect(
      violations.map(describeViolation),
      `axe violations in ${colorScheme} mode`
    ).toEqual([]);
  }
}
