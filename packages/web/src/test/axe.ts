import axe, { type RunOptions } from "axe-core";
import { expect } from "vitest";
import { AXE_TAGS, describeViolation } from "./axe-rules";

/** Rules that can't work in jsdom or on a component outside its page. */
const SKIPPED_RULES: RunOptions["rules"] = {
  // jsdom doesn't render, so there are no colors to compare. The end-to-end
  // checks cover contrast in light and dark mode.
  "color-contrast": { enabled: false },
  // A component renders without the page's landmarks around it.
  region: { enabled: false },
};

/**
 * Fail the test if axe finds WCAG 2.2 AA or best-practice violations in
 * `container`, which defaults to the whole document, so portals such as
 * dialogs are checked too. Pass `rules` to turn a rule off for one check.
 */
export async function expectNoAxeViolations(
  container: Element = document.body,
  { rules }: Pick<RunOptions, "rules"> = {}
): Promise<void> {
  const { violations } = await axe.run(container, {
    runOnly: { type: "tag", values: AXE_TAGS },
    rules: { ...SKIPPED_RULES, ...rules },
  });
  expect(violations.map(describeViolation)).toEqual([]);
}
