import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api/api-error";
import {
  createExpenseServerErrors,
  previewShares,
  type SimpleExpenseValues,
  toCreateExpenseRequest,
  validateSimpleExpense,
} from "./expense-form";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const NAMES: Record<string, string> = {
  [A]: "Alice",
  [B]: "Bartek",
  [C]: "Celina",
};
const TURNED_OFF = /turned off/;
const nameOf = (id: string) => NAMES[id] ?? "Someone";

const values = (
  overrides: Partial<SimpleExpenseValues> = {}
): SimpleExpenseValues => ({
  name: "Pizza",
  amount: "100",
  currency: "PLN",
  expenseDate: "2026-03-01",
  categoryId: null,
  participantIds: [A, B, C],
  ...overrides,
});

const invalidReference = (paths: (string | number)[][]) =>
  ApiRequestError.fromBody("api", 400, {
    code: "INVALID_REFERENCE",
    message: "Invalid reference",
    details: {
      issues: paths.map((path) => ({ path, message: "Not a current member" })),
    },
  });

describe("toCreateExpenseRequest", () => {
  it("makes the payer pay it all and splits it equally", () => {
    expect(
      toCreateExpenseRequest(values({ name: " Pizza ", amount: "12,5" }), A)
    ).toEqual({
      name: "Pizza",
      categoryId: null,
      expenseDate: "2026-03-01",
      total: { amountCents: 1250, currency: "PLN" },
      payers: [{ userId: A, amountCents: 1250 }],
      allocation: {
        method: "equal",
        participants: [{ userId: A }, { userId: B }, { userId: C }],
      },
    });
  });

  it("has nothing to send without an amount", () => {
    expect(toCreateExpenseRequest(values({ amount: "" }), A)).toBeNull();
  });
});

describe("previewShares", () => {
  it("splits with the allocation engine, extra units to the lowest IDs", () => {
    expect(previewShares(values())).toEqual([
      { userId: A, amountCents: 3334 },
      { userId: B, amountCents: 3333 },
      { userId: C, amountCents: 3333 },
    ]);
  });

  it.each([
    ["no amount", { amount: "" }],
    ["a zero amount", { amount: "0" }],
    ["too many decimals", { amount: "1.234" }],
    ["too large an amount", { amount: "10000000001" }],
    ["nobody", { participantIds: [] }],
  ])("shows nothing for %s", (_, overrides) => {
    expect(previewShares(values(overrides))).toBeNull();
  });
});

describe("validateSimpleExpense", () => {
  it("accepts a valid expense", () => {
    expect(validateSimpleExpense(values(), A)).toBeUndefined();
  });

  it("says what to fix in each field", () => {
    expect(
      validateSimpleExpense(
        values({ name: "  ", amount: "", expenseDate: "", participantIds: [] }),
        A
      )
    ).toEqual({
      fields: {
        name: "Enter a name.",
        amount: "Enter an amount.",
        expenseDate: "Pick a date.",
        participantIds: "Pick at least one person to split it with.",
      },
      form: undefined,
    });
  });

  it.each([
    ["0", "Enter an amount above zero."],
    ["10000000000.01", "That amount is too large."],
    ["1.234", "PLN amounts have at most 2 decimals."],
  ])("rejects %s", (amount, message) => {
    expect(validateSimpleExpense(values({ amount }), A)?.fields).toEqual({
      amount: message,
    });
  });
});

describe("createExpenseServerErrors", () => {
  it("names the participants who left on the participant list", () => {
    expect(
      createExpenseServerErrors(
        invalidReference([
          ["allocation", "participants", 1, "userId"],
          ["allocation", "participants", 2, "userId"],
        ]),
        [A, B, C],
        nameOf
      )
    ).toEqual({
      fields: {
        participantIds:
          "Bartek and Celina left the household. Uncheck everyone who left to save.",
      },
    });
  });

  it("asks for another category when it was deleted", () => {
    expect(
      createExpenseServerErrors(invalidReference([["categoryId"]]), [A], nameOf)
    ).toEqual({
      fields: { categoryId: "This category was deleted. Pick another one." },
    });
  });

  it("puts what fits no field on the form", () => {
    expect(
      createExpenseServerErrors(
        ApiRequestError.fromBody("api", 403, {
          code: "MODULE_DISABLED",
          message: "Module disabled",
        }),
        [A],
        nameOf
      ).form
    ).toMatch(TURNED_OFF);
  });
});
