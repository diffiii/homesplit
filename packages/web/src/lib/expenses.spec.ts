import type { Expense, ExpenseAllocationInput } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import {
  allocationInput,
  expenseFiltersSearch,
  formatGroupDate,
  formatPayers,
  groupByDate,
  parseExpenseFilters,
  userNet,
} from "./expenses";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const user = (id: string, name: string) => ({ id, name, imageUrl: null });

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: crypto.randomUUID(),
    householdId: crypto.randomUUID(),
    name: "Pizza",
    description: null,
    total: { amountCents: 9000, currency: "PLN" },
    payers: [{ user: user(A, "Alice"), amountCents: 9000 }],
    author: user(A, "Alice"),
    category: null,
    expenseDate: "2026-03-01",
    allocation: {
      method: "equal",
      participants: [{ userId: A }, { userId: B }],
    },
    splits: [
      { user: user(A, "Alice"), amountCents: 4500 },
      { user: user(B, "Bartek"), amountCents: 4500 },
    ],
    attachments: [],
    receiptId: null,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("parseExpenseFilters", () => {
  it("reads every filter from the URL", () => {
    const search = new URLSearchParams({
      category: "none",
      person: A.toUpperCase(),
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(parseExpenseFilters(search)).toEqual({
      categoryId: "none",
      userId: A,
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("drops values the API would reject, and dates that run backwards", () => {
    expect(
      parseExpenseFilters(
        new URLSearchParams({ category: "food", person: "1", from: "March" })
      )
    ).toEqual({});
    expect(
      parseExpenseFilters(
        new URLSearchParams({ from: "2026-04-01", to: "2026-03-01" })
      )
    ).toEqual({});
  });

  it("round-trips through the query string", () => {
    const filters = { categoryId: B, from: "2026-03-01" };
    const search = expenseFiltersSearch(filters);
    expect(search).toBe(`category=${B}&from=2026-03-01`);
    expect(parseExpenseFilters(new URLSearchParams(search))).toEqual(filters);
    expect(expenseFiltersSearch({})).toBe("");
  });
});

describe("groupByDate", () => {
  it("groups consecutive expenses on one date, keeping their order", () => {
    const first = expense({ expenseDate: "2026-03-02" });
    const second = expense({ expenseDate: "2026-03-02" });
    const third = expense({ expenseDate: "2026-03-01" });
    expect(groupByDate([first, second, third])).toEqual([
      { date: "2026-03-02", expenses: [first, second] },
      { date: "2026-03-01", expenses: [third] },
    ]);
  });
});

describe("formatGroupDate", () => {
  const now = new Date(2026, 2, 10, 9, 0);
  it.each([
    ["2026-03-10", "Today"],
    ["2026-03-09", "Yesterday"],
    ["2026-03-01", "Mar 1, 2026"],
  ])("shows %s as %s", (date, label) => {
    expect(formatGroupDate(date, now)).toBe(label);
  });
});

describe("formatPayers", () => {
  const payer = (id: string, name: string) => ({
    user: user(id, name),
    amountCents: 1,
  });
  it("names one or two payers and counts the rest", () => {
    expect(formatPayers({ payers: [payer(A, "Alice")] })).toBe("Alice");
    expect(
      formatPayers({ payers: [payer(A, "Alice"), payer(B, "Bartek")] })
    ).toBe("Alice and Bartek");
    expect(
      formatPayers({
        payers: [payer(A, "Alice"), payer(B, "Bartek"), payer(C, "Celina")],
      })
    ).toBe("Alice and 2 others");
  });
});

describe("userNet", () => {
  it("says what the payer lent and what a participant owes", () => {
    expect(userNet(expense(), A)).toEqual({
      kind: "lent",
      text: "You lent PLN\u00A045.00",
    });
    expect(userNet(expense(), B)).toEqual({
      kind: "owes",
      text: "You owe PLN\u00A045.00",
    });
  });

  it("tells settled from not involved", () => {
    const paidOwnShare = expense({
      payers: [
        { user: user(A, "Alice"), amountCents: 4500 },
        { user: user(B, "Bartek"), amountCents: 4500 },
      ],
    });
    expect(userNet(paidOwnShare, A)).toEqual({ kind: "settled" });
    expect(userNet(expense(), C)).toEqual({ kind: "not-involved" });
  });

  it("uses the expense's own currency", () => {
    const euros = expense({ total: { amountCents: 9000, currency: "EUR" } });
    expect(userNet(euros, B)).toEqual({
      kind: "owes",
      text: "You owe EUR\u00A045.00",
    });
  });
});

describe("allocationInput", () => {
  it.each([
    [
      {
        method: "percentage",
        participants: [{ userId: A, basisPoints: 3333 }],
      },
      "33.33%",
    ],
    [
      { method: "shares", participants: [{ userId: A, shares: 2 }] },
      "2 shares",
    ],
    [{ method: "shares", participants: [{ userId: A, shares: 1 }] }, "1 share"],
    [
      { method: "exact", participants: [{ userId: A, amountCents: 1250 }] },
      "PLN\u00A012.50",
    ],
    [
      {
        method: "adjustment",
        participants: [{ userId: A, adjustmentCents: -1000 }],
      },
      "-PLN\u00A010.00",
    ],
    [
      {
        method: "adjustment",
        participants: [{ userId: A, adjustmentCents: 0 }],
      },
      "No adjustment",
    ],
    [{ method: "equal", participants: [{ userId: A }] }, null],
  ] as [ExpenseAllocationInput, string | null][])(
    "shows %o as %s",
    (allocation, text) => {
      expect(allocationInput(allocation, A, "PLN")).toBe(text);
    }
  );
});
