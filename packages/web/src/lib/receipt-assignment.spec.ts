import type { Receipt, ReceiptItem, UserSummary } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import {
  assignedUnits,
  confirmDefaults,
  confirmReadiness,
  countsUnits,
  equalAssignees,
  setUnits,
  toConfirmReceiptRequest,
  toggleAssignee,
  validateConfirm,
  withAssignments,
} from "./receipt-assignment";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

const user = (id: string, name: string): UserSummary => ({
  id,
  name,
  imageUrl: null,
});

const alice = user(A, "Alice");
const bartek = user(B, "Bartek");
const celina = user(C, "Celina");

const item = (
  quantity: number,
  assignments: [UserSummary, number][] = []
): Pick<ReceiptItem, "assignments" | "quantity"> => ({
  quantity,
  assignments: assignments.map(([who, shares]) => ({ user: who, shares })),
});

describe("countsUnits", () => {
  it("counts whole quantities above one in units", () => {
    expect(countsUnits({ quantity: 3 })).toBe(true);
    expect(countsUnits({ quantity: 1 })).toBe(false);
    expect(countsUnits({ quantity: 0.452 })).toBe(false);
    expect(countsUnits({ quantity: 2.5 })).toBe(false);
  });
});

describe("assignedUnits", () => {
  it("adds up the shares", () => {
    expect(
      assignedUnits(
        item(3, [
          [alice, 2],
          [bartek, 1],
        ])
      )
    ).toBe(3);
    expect(assignedUnits(item(3))).toBe(0);
  });
});

describe("toggleAssignee", () => {
  it("adds someone with one share", () => {
    expect(toggleAssignee(item(1, [[alice, 1]]), B)).toEqual([
      { userId: A, shares: 1 },
      { userId: B, shares: 1 },
    ]);
  });

  it("takes someone off and keeps the others' units", () => {
    expect(
      toggleAssignee(
        item(3, [
          [alice, 2],
          [bartek, 1],
        ]),
        B
      )
    ).toEqual([{ userId: A, shares: 2 }]);
  });
});

describe("setUnits", () => {
  it("changes one person's units", () => {
    expect(
      setUnits(
        item(3, [
          [alice, 1],
          [bartek, 1],
        ]),
        A,
        2
      )
    ).toEqual([
      { userId: A, shares: 2 },
      { userId: B, shares: 1 },
    ]);
  });
});

describe("equalAssignees", () => {
  it("gives everyone one share", () => {
    expect(equalAssignees([A, B])).toEqual([
      { userId: A, shares: 1 },
      { userId: B, shares: 1 },
    ]);
  });
});

describe("withAssignments", () => {
  const receipt = {
    items: [
      { id: "beer", ...item(3, [[bartek, 1]]) },
      { id: "pizza", ...item(1) },
    ],
  } as unknown as Receipt;

  it("replaces the listed items' assignments, ordered by user ID", () => {
    const result = withAssignments(
      receipt,
      {
        items: [
          {
            itemId: "beer",
            assignees: [
              { userId: C, shares: 1 },
              { userId: B, shares: 2 },
            ],
          },
        ],
      },
      new Map([[C, celina]])
    );

    expect(result.items[0]?.assignments).toEqual([
      { user: bartek, shares: 2 },
      { user: celina, shares: 1 },
    ]);
    expect(result.items[1]).toBe(receipt.items[1]);
  });
});

describe("confirmReadiness", () => {
  const receipt = {
    currency: "PLN",
    totalCents: 4497,
    items: [{}] as ReceiptItem[],
  };
  const split = { differenceCents: 0, unassignedItemIds: [] };

  it("is ready once everything is assigned and adds up", () => {
    expect(confirmReadiness(receipt, split)).toEqual({ ok: true });
  });

  it("says what's in the way", () => {
    expect(confirmReadiness({ ...receipt, items: [] }, split)).toMatchObject({
      reason: "no-items",
    });
    expect(
      confirmReadiness({ ...receipt, totalCents: null }, split)
    ).toMatchObject({ reason: "incomplete" });
    expect(
      confirmReadiness(receipt, { ...split, differenceCents: 3 })
    ).toMatchObject({ reason: "mismatch" });
    expect(
      confirmReadiness(receipt, { ...split, unassignedItemIds: ["a", "b"] })
    ).toEqual({
      ok: false,
      reason: "unassigned",
      text: "Assign the 2 remaining items to someone.",
    });
  });
});

describe("confirmDefaults", () => {
  const receipt = {
    createdBy: bartek,
    merchant: "Żabka",
    purchasedOn: "2026-11-20",
    suggestedCategory: { categoryId: "groceries", confidence: "high" as const },
  };
  const context = {
    memberIds: new Set([A, B]),
    today: "2026-11-27",
    userId: A,
  };

  it("takes the scanner, the receipt's name and date, and a confident category", () => {
    expect(confirmDefaults(receipt, context)).toEqual({
      payerId: B,
      name: "Żabka",
      expenseDate: "2026-11-20",
      categoryId: "groceries",
    });
  });

  it("falls back to the user, today, and no category", () => {
    expect(
      confirmDefaults(
        {
          ...receipt,
          merchant: null,
          purchasedOn: null,
          suggestedCategory: { categoryId: "groceries", confidence: "low" },
        },
        { ...context, memberIds: new Set([A]) }
      )
    ).toEqual({
      payerId: A,
      name: "",
      expenseDate: "2026-11-27",
      categoryId: null,
    });
  });
});

describe("validateConfirm", () => {
  it("needs a name and a date", () => {
    expect(
      validateConfirm({
        payerId: A,
        name: " ",
        expenseDate: "",
        categoryId: null,
      })
    ).toEqual({
      fields: { name: "Enter a name.", expenseDate: "Pick a date." },
    });
  });

  it("sends the trimmed name", () => {
    expect(
      toConfirmReceiptRequest({
        payerId: A,
        name: " Żabka ",
        expenseDate: "2026-11-20",
        categoryId: null,
      })
    ).toEqual({
      payerId: A,
      name: "Żabka",
      expenseDate: "2026-11-20",
      categoryId: null,
    });
  });
});
