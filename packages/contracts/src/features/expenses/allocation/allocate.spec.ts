import { describe, expect, it } from "vitest";

import { MAX_AMOUNT_CENTS, MAX_SHARES } from "../../../common/money";
import { CreateExpenseRequest } from "..";
import { type AllocatedSplit, allocate } from "./allocate";
import { AllocationError, type AllocationErrorCode } from "./allocation-error";
import type { ExpenseAllocationInput } from "./input";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";

const byUser = (splits: AllocatedSplit[]) =>
  Object.fromEntries(splits.map((s) => [s.userId, s.amountCents]));

const equal = (...userIds: string[]): ExpenseAllocationInput => ({
  method: "equal",
  participants: userIds.map((userId) => ({ userId })),
});

function expectCode(run: () => unknown, code: AllocationErrorCode) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AllocationError);
  expect((caught as AllocationError).code).toBe(code);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest]
    )
  );
}

const reordered = (
  allocation: ExpenseAllocationInput,
  participants: ExpenseAllocationInput["participants"]
) => ({ ...allocation, participants }) as ExpenseAllocationInput;

describe("allocate", () => {
  describe("equal", () => {
    it("gives a one-unit total to the lowest user ID", () => {
      expect(byUser(allocate(1, equal(C, A, B)))).toEqual({
        [A]: 1,
        [B]: 0,
        [C]: 0,
      });
    });

    it("splits an uneven total with the leftover to the lowest user IDs", () => {
      expect(byUser(allocate(100, equal(A, B, C)))).toEqual({
        [A]: 34,
        [B]: 33,
        [C]: 33,
      });
      expect(byUser(allocate(102, equal(D, C, B, A)))).toEqual({
        [A]: 26,
        [B]: 26,
        [C]: 25,
        [D]: 25,
      });
    });

    it("gives the whole total to a single participant", () => {
      expect(byUser(allocate(1999, equal(A)))).toEqual({ [A]: 1999 });
    });
  });

  describe("percentage", () => {
    it("gives the leftover to the largest remainder", () => {
      const splits = allocate(1000, {
        method: "percentage",
        participants: [
          { userId: A, basisPoints: 3333 },
          { userId: B, basisPoints: 3333 },
          { userId: C, basisPoints: 3334 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 333, [B]: 333, [C]: 334 });
    });

    it("allows a 1-basis-point participant to round down to zero", () => {
      const splits = allocate(100, {
        method: "percentage",
        participants: [
          { userId: A, basisPoints: 1 },
          { userId: B, basisPoints: 9999 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 0, [B]: 100 });
    });

    it("gives a single participant at 100% the whole total", () => {
      const splits = allocate(MAX_AMOUNT_CENTS, {
        method: "percentage",
        participants: [{ userId: A, basisPoints: 10_000 }],
      });
      expect(byUser(splits)).toEqual({ [A]: MAX_AMOUNT_CENTS });
    });
  });

  describe("shares", () => {
    it("splits in proportion to shares", () => {
      const splits = allocate(1000, {
        method: "shares",
        participants: [
          { userId: A, shares: 1 },
          { userId: B, shares: 2 },
          { userId: C, shares: 3 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 167, [B]: 333, [C]: 500 });
    });

    it("handles the largest total and share counts without overflow", () => {
      const splits = allocate(MAX_AMOUNT_CENTS, {
        method: "shares",
        participants: [
          { userId: A, shares: MAX_SHARES },
          { userId: B, shares: 1 },
          { userId: C, shares: MAX_SHARES - 1 },
        ],
      });
      expect(splits.reduce((acc, s) => acc + s.amountCents, 0)).toBe(
        MAX_AMOUNT_CENTS
      );
      expect(byUser(splits)).toEqual({
        [A]: 500_000_000_000,
        [B]: 500_000,
        [C]: 499_999_500_000,
      });
    });
  });

  describe("exact", () => {
    it("returns the given amounts, including zero", () => {
      const splits = allocate(1000, {
        method: "exact",
        participants: [
          { userId: A, amountCents: 0 },
          { userId: B, amountCents: 400 },
          { userId: C, amountCents: 600 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 0, [B]: 400, [C]: 600 });
    });
  });

  describe("adjustment", () => {
    it("splits the remainder equally, then adds signed adjustments", () => {
      // Base 1000 - 50 = 950 splits into 317, 317, 316.
      const splits = allocate(1000, {
        method: "adjustment",
        participants: [
          { userId: A, adjustmentCents: 100 },
          { userId: B, adjustmentCents: -50 },
          { userId: C, adjustmentCents: 0 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 417, [B]: 267, [C]: 316 });
    });

    it("allows adjustments down to minus the total", () => {
      // The same split as -300 and -100, which go below minus the total.
      const splits = allocate(200, {
        method: "adjustment",
        participants: [
          { userId: A, adjustmentCents: -200 },
          { userId: B, adjustmentCents: 0 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 0, [B]: 200 });
    });

    it("allows an adjustment that brings a share to exactly zero", () => {
      const splits = allocate(100, {
        method: "adjustment",
        participants: [
          { userId: A, adjustmentCents: -100 },
          { userId: B, adjustmentCents: 0 },
        ],
      });
      expect(byUser(splits)).toEqual({ [A]: 0, [B]: 100 });
    });
  });

  describe("reordered inputs", () => {
    const cases: ExpenseAllocationInput[] = [
      equal(A, B, C, D),
      {
        method: "percentage",
        participants: [
          { userId: A, basisPoints: 2500 },
          { userId: B, basisPoints: 2500 },
          { userId: C, basisPoints: 2501 },
          { userId: D, basisPoints: 2499 },
        ],
      },
      {
        method: "shares",
        participants: [
          { userId: A, shares: 1 },
          { userId: B, shares: 1 },
          { userId: C, shares: 2 },
          { userId: D, shares: 3 },
        ],
      },
      {
        method: "exact",
        participants: [
          { userId: A, amountCents: 0 },
          { userId: B, amountCents: 1 },
          { userId: C, amountCents: 2 },
          { userId: D, amountCents: 998 },
        ],
      },
      {
        method: "adjustment",
        participants: [
          { userId: A, adjustmentCents: 7 },
          { userId: B, adjustmentCents: -3 },
          { userId: C, adjustmentCents: 0 },
          { userId: D, adjustmentCents: 0 },
        ],
      },
    ];

    it.each(cases)(
      "gives every user the same amount ($method)",
      (allocation) => {
        const expected = byUser(allocate(1001, allocation));
        for (const participants of permutations([...allocation.participants])) {
          const splits = allocate(1001, reordered(allocation, participants));
          expect(byUser(splits)).toEqual(expected);
        }
      }
    );
  });

  describe("validation", () => {
    it("rejects totals outside 1 to MAX_AMOUNT_CENTS", () => {
      for (const total of [0, -1, 1.5, MAX_AMOUNT_CENTS + 1, Number.NaN]) {
        expectCode(() => allocate(total, equal(A)), "INVALID_TOTAL");
      }
      expect(allocate(MAX_AMOUNT_CENTS, equal(A, B, C))).toHaveLength(3);
    });

    it("rejects an empty participant list", () => {
      expectCode(() => allocate(100, equal()), "EMPTY_PARTICIPANTS");
    });

    it("rejects duplicate participants", () => {
      expectCode(() => allocate(100, equal(A, B, A)), "DUPLICATE_PARTICIPANT");
    });

    it("rejects weights out of range", () => {
      for (const basisPoints of [0, 10_001, 0.5]) {
        expectCode(
          () =>
            allocate(100, {
              method: "percentage",
              participants: [{ userId: A, basisPoints }],
            }),
          "INVALID_WEIGHT"
        );
      }
      for (const shares of [0, -1, MAX_SHARES + 1, 1.5]) {
        expectCode(
          () =>
            allocate(100, {
              method: "shares",
              participants: [{ userId: A, shares }],
            }),
          "INVALID_WEIGHT"
        );
      }
    });

    it("rejects amounts out of range", () => {
      expectCode(
        () =>
          allocate(100, {
            method: "exact",
            participants: [
              { userId: A, amountCents: -1 },
              { userId: B, amountCents: 101 },
            ],
          }),
        "INVALID_AMOUNT"
      );
      expectCode(
        () =>
          allocate(100, {
            method: "adjustment",
            participants: [
              { userId: A, adjustmentCents: MAX_AMOUNT_CENTS + 1 },
            ],
          }),
        "INVALID_AMOUNT"
      );
    });

    it("rejects percentages that don't add up to 100%", () => {
      expectCode(
        () =>
          allocate(100, {
            method: "percentage",
            participants: [
              { userId: A, basisPoints: 5000 },
              { userId: B, basisPoints: 4999 },
            ],
          }),
        "PERCENTAGE_SUM_MISMATCH"
      );
    });

    it("rejects exact amounts that don't add up to the total", () => {
      expectCode(
        () =>
          allocate(100, {
            method: "exact",
            participants: [
              { userId: A, amountCents: 50 },
              { userId: B, amountCents: 49 },
            ],
          }),
        "EXACT_SUM_MISMATCH"
      );
    });

    it("rejects an adjustment below minus the total", () => {
      expectCode(
        () =>
          allocate(200, {
            method: "adjustment",
            participants: [
              { userId: A, adjustmentCents: -300 },
              { userId: B, adjustmentCents: -100 },
            ],
          }),
        "INVALID_AMOUNT"
      );
    });

    it("rejects adjustments that add up to more than the total", () => {
      expectCode(
        () =>
          allocate(200, {
            method: "adjustment",
            participants: [
              { userId: A, adjustmentCents: 300 },
              { userId: B, adjustmentCents: 100 },
            ],
          }),
        "ADJUSTMENT_SUM_EXCEEDS_TOTAL"
      );
    });

    it("rejects adjustments that leave a share negative", () => {
      // Before rounding, B's share is 101 / 2 - 51 = -0.5.
      expectCode(
        () =>
          allocate(100, {
            method: "adjustment",
            participants: [
              { userId: A, adjustmentCents: 50 },
              { userId: B, adjustmentCents: -51 },
            ],
          }),
        "NEGATIVE_SHARE"
      );
    });

    it("rejects a share negative before rounding, whoever gets the leftover unit", () => {
      // Base 1 splits into 0.5 each before rounding, so -1 leaves -0.5.
      for (const [minus, plus] of [
        [A, B],
        [B, A],
      ]) {
        expectCode(
          () =>
            allocate(1, {
              method: "adjustment",
              participants: [
                { userId: minus, adjustmentCents: -1 },
                { userId: plus, adjustmentCents: 1 },
              ],
            }),
          "NEGATIVE_SHARE"
        );
      }
    });
  });
});

describe("CreateExpenseRequest and allocate", () => {
  it.each([
    [300, 100, false],
    [-300, -100, false],
    [-200, 0, true],
  ])("agree on adjustments %i and %i on 200", (a, b, valid) => {
    const allocation: ExpenseAllocationInput = {
      method: "adjustment",
      participants: [
        { userId: A, adjustmentCents: a },
        { userId: B, adjustmentCents: b },
      ],
    };
    const request = {
      name: "Snack",
      expenseDate: "2026-11-22",
      total: { amountCents: 200, currency: "PLN" },
      payers: [{ userId: A, amountCents: 200 }],
      allocation,
    };
    expect(CreateExpenseRequest.safeParse(request).success).toBe(valid);
    if (valid) {
      expect(byUser(allocate(200, allocation))).toEqual({ [A]: 0, [B]: 200 });
    } else {
      expect(() => allocate(200, allocation)).toThrow(AllocationError);
    }
  });
});
