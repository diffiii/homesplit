import { describe, expect, it } from "vitest";

import { distributeProportionally } from "./distribute";

const weighted = (...pairs: [string, number][]) =>
  pairs.map(([key, weight]) => ({ key, weight: BigInt(weight) }));

const parts = (...pairs: [string, number][]) =>
  pairs.map(([key, amount]) => ({ key, amount: BigInt(amount) }));

describe("distributeProportionally", () => {
  it("gives leftover units to the lower keys when remainders tie", () => {
    expect(
      distributeProportionally(100n, weighted(["a", 1], ["b", 1], ["c", 1]))
    ).toMatchObject(parts(["a", 34], ["b", 33], ["c", 33]));
    expect(
      distributeProportionally(100n, weighted(["c", 1], ["a", 1], ["b", 1]))
    ).toMatchObject(parts(["c", 33], ["a", 34], ["b", 33]));
  });

  it("gives leftover units to the largest remainders first", () => {
    // 10 * 1/3 = 3 r 1, 10 * 2/3 = 6 r 2
    expect(
      distributeProportionally(10n, weighted(["a", 1], ["b", 2]))
    ).toMatchObject(parts(["a", 3], ["b", 7]));
  });

  it("splits a negative total with a mathematical floor", () => {
    expect(
      distributeProportionally(-10n, weighted(["a", 1], ["b", 1], ["c", 1]))
    ).toMatchObject(parts(["a", -3], ["b", -3], ["c", -4]));
  });

  it("never gives units to a zero weight", () => {
    expect(
      distributeProportionally(5n, weighted(["a", 0], ["b", 1], ["c", 1]))
    ).toMatchObject(parts(["a", 0], ["b", 3], ["c", 2]));
  });

  it("does not overflow with large totals and weights", () => {
    const total = 1_000_000_000_000n;
    const result = distributeProportionally(
      total,
      weighted(["a", 999_999], ["b", 1_000_000], ["c", 1])
    );
    expect(result.reduce((acc, part) => acc + part.amount, 0n)).toBe(total);
  });

  it("rejects invalid weights", () => {
    expect(() => distributeProportionally(1n, [])).toThrow(RangeError);
    expect(() =>
      distributeProportionally(1n, weighted(["a", 0], ["b", 0]))
    ).toThrow(RangeError);
    expect(() =>
      distributeProportionally(1n, weighted(["a", 1], ["b", -1]))
    ).toThrow(RangeError);
    expect(() =>
      distributeProportionally(1n, weighted(["a", 1], ["a", 1]))
    ).toThrow(RangeError);
  });
});
