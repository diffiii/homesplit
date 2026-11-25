import { describe, expect, it } from "vitest";

import { adjustmentProblems } from "./adjustment-problems";

describe("adjustmentProblems", () => {
  it("accepts adjustments down to minus the total and up to the total", () => {
    expect(adjustmentProblems(200, [-200, 0])).toEqual([]);
    expect(adjustmentProblems(200, [200, 0])).toEqual([]);
  });

  it("names each adjustment below minus the total", () => {
    expect(adjustmentProblems(200, [-300, 0, -201])).toEqual([
      { reason: "below_total", index: 0 },
      { reason: "below_total", index: 2 },
    ]);
  });

  it("reports both range problems together", () => {
    expect(adjustmentProblems(200, [-300, 600])).toEqual([
      { reason: "below_total", index: 0 },
      { reason: "sum_over_total" },
    ]);
  });

  it("leaves shares unchecked once the adjustments add up to more than the total", () => {
    // The other two would get (100 - 130) / 3 = -10 each.
    expect(adjustmentProblems(100, [130, 0, 0])).toEqual([
      { reason: "sum_over_total" },
    ]);
  });

  it("names each share negative before rounding", () => {
    // Base 1 splits into 0.5 each, so -1 leaves -0.5.
    expect(adjustmentProblems(1, [-1, 1])).toEqual([
      { reason: "negative_share", index: 0 },
    ]);
    expect(adjustmentProblems(100, [120, -10, -10])).toEqual([
      { reason: "negative_share", index: 1 },
      { reason: "negative_share", index: 2 },
    ]);
  });
});
