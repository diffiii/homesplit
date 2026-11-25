import { describe, expect, it } from "vitest";
import { splitReceipt } from "./split";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

const item = (
  id: string,
  totalCents: number,
  assignments: [string, number][] = []
) => ({
  id,
  totalCents,
  assignments: assignments.map(([userId, shares]) => ({ userId, shares })),
});

const amountsOf = (result: ReturnType<typeof splitReceipt>) =>
  Object.fromEntries(
    result.amounts.map(({ userId, amountCents }) => [userId, amountCents])
  );

describe("splitReceipt", () => {
  it("splits by units and equal shares", () => {
    // Beer 3 × 4.99 (A 2 units, B 1) and pizza 30.00 (A, B, and C).
    const result = splitReceipt(
      [
        item("beer", 1497, [
          [A, 2],
          [B, 1],
        ]),
        item("pizza", 3000, [
          [A, 1],
          [B, 1],
          [C, 1],
        ]),
      ],
      0
    );

    expect(result).toEqual({
      totalCents: 4497,
      amounts: [
        { userId: A, amountCents: 1998 },
        { userId: B, amountCents: 1499 },
        { userId: C, amountCents: 1000 },
      ],
      unassignedCents: 0,
      unassignedItemIds: [],
    });
  });

  it("rounds once, giving leftover units by the remainder rule", () => {
    // 10.00 three ways is 3.33⅓ each; the leftover unit goes to the lowest ID.
    const result = splitReceipt(
      [
        item("wine", 1000, [
          [C, 1],
          [B, 1],
          [A, 1],
        ]),
      ],
      0
    );

    expect(amountsOf(result)).toEqual({ [A]: 334, [B]: 333, [C]: 333 });
  });

  it("keeps fractions across items until the end", () => {
    // 0.01 three ways twice: each user has 0.0066…, so only the sum is rounded.
    const result = splitReceipt(
      [
        item("a", 1, [
          [A, 1],
          [B, 1],
          [C, 1],
        ]),
        item("b", 1, [
          [A, 1],
          [B, 1],
          [C, 1],
        ]),
      ],
      0
    );

    expect(amountsOf(result)).toEqual({ [A]: 1, [B]: 1, [C]: 0 });
  });

  it("spreads the receipt discount over items by their cost", () => {
    // 10.00 off 30.00 + 10.00 is a quarter off each item.
    const result = splitReceipt(
      [item("pizza", 3000, [[A, 1]]), item("salad", 1000, [[B, 1]])],
      1000
    );

    expect(result.totalCents).toBe(3000);
    expect(amountsOf(result)).toEqual({ [A]: 2250, [B]: 750 });
  });

  it("splits weighed items by shares", () => {
    const result = splitReceipt(
      [
        item("cheese", 1789, [
          [A, 3],
          [B, 1],
        ]),
      ],
      0
    );

    expect(amountsOf(result)).toEqual({ [A]: 1342, [B]: 447 });
  });

  it("reports unassigned items and their part of the total", () => {
    const result = splitReceipt(
      [item("beer", 1497, [[A, 1]]), item("chips", 503)],
      100
    );

    expect(result).toMatchObject({
      totalCents: 1900,
      unassignedItemIds: ["chips"],
    });
    expect(amountsOf(result)).toEqual({ [A]: 1422 });
    expect(result.unassignedCents).toBe(478);
  });

  it("leaves everything unassigned while nothing costs anything", () => {
    expect(splitReceipt([], 0)).toEqual({
      totalCents: 0,
      amounts: [],
      unassignedCents: 0,
      unassignedItemIds: [],
    });
  });
});
