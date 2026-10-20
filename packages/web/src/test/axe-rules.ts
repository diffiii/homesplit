import type { Result } from "axe-core";

/**
 * The axe rule sets component and end-to-end tests check: WCAG 2.2 level A
 * and AA, and axe's best practices.
 */
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

/** A violation as a rule and the elements breaking it, for a readable test failure. */
export function describeViolation({ id, help, nodes }: Result): string {
  const targets = nodes.map(({ target }) => `  ${target.join(" ")}`);
  return [`${id}: ${help}`, ...targets].join("\n");
}
