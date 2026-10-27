import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { AXE_TAGS, describeViolation } from "../src/test/axe-rules";

// Colors measured mid-transition would be neither theme's.
const NO_MOTION =
  "*, *::before, *::after { transition: none !important; animation: none !important; }";

/** Rules a third-party widget is known to break, skipped only inside it. */
export interface KnownViolations {
  rules: string[];
  selector: string;
}

/**
 * Fail the test if axe finds WCAG 2.2 AA or best-practice violations on the
 * page in dark mode or in light mode, so contrast is checked in both. Leaves
 * the page in light mode, the default.
 */
export async function expectNoAxeViolations(
  page: Page,
  known?: KnownViolations
): Promise<void> {
  await page.addStyleTag({ content: NO_MOTION });
  for (const colorScheme of ["dark", "light"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: the schemes take turns on one page
    await page.emulateMedia({ colorScheme });
    // The theme follows the system once the app sees the media query change.
    await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
    const violations = await analyze(page, known);
    expect(
      violations.map(describeViolation),
      `axe violations in ${colorScheme} mode`
    ).toEqual([]);
  }
}

async function analyze(page: Page, known: KnownViolations | undefined) {
  const axe = () => new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (!known) {
    return (await axe().analyze()).violations;
  }
  // One axe run at a time: runs on the same page share its state.
  const outside = await axe().exclude(known.selector).analyze();
  const inside = await axe()
    .include(known.selector)
    .disableRules(known.rules)
    .analyze();
  return [...outside.violations, ...inside.violations];
}
