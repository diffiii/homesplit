import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api/api-error";
import {
  createExpenseServerErrors,
  type ExpenseFormValues,
  fitsSimpleMode,
  formatPercentage,
  initialExpenseValues,
  payerAmountInputs,
  payersCheck,
  previewShares,
  splitCheck,
  splitInputs,
  toCreateExpenseRequest,
  validateExpense,
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
  overrides: Partial<ExpenseFormValues> = {}
): ExpenseFormValues => ({
  ...initialExpenseValues({
    currency: "PLN",
    expenseDate: "2026-03-01",
    participantIds: [A, B, C],
    userId: A,
  }),
  name: "Pizza",
  amount: "100",
  ...overrides,
});

/** Advanced mode with `overrides`, such as payers or a method. */
const advanced = (overrides: Partial<ExpenseFormValues> = {}) =>
  values({ advanced: true, ...overrides });

const splits = (overrides: Partial<ExpenseFormValues["splits"]>) => ({
  ...values().splits,
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

describe("validateExpense", () => {
  it("accepts a valid expense", () => {
    expect(validateExpense(values(), A)).toBeUndefined();
  });

  it("says what to fix in each field", () => {
    expect(
      validateExpense(
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
    expect(validateExpense(values({ amount }), A)?.fields).toEqual({
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
        values(),
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
      createExpenseServerErrors(
        invalidReference([["categoryId"]]),
        values(),
        nameOf
      )
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
        values(),
        nameOf
      ).form
    ).toMatch(TURNED_OFF);
  });
});

describe("advanced toCreateExpenseRequest", () => {
  it("sends each payer's amount and each person's percentage", () => {
    const request = toCreateExpenseRequest(
      advanced({
        payerIds: [A, B],
        payerAmounts: { [A]: "60", [B]: "40" },
        method: "percentage",
        splits: splits({ percentage: { [A]: "50", [B]: "12.5", [C]: "37,5" } }),
      }),
      A
    );
    expect(request?.payers).toEqual([
      { userId: A, amountCents: 6000 },
      { userId: B, amountCents: 4000 },
    ]);
    expect(request?.allocation).toEqual({
      method: "percentage",
      participants: [
        { userId: A, basisPoints: 5000 },
        { userId: B, basisPoints: 1250 },
        { userId: C, basisPoints: 3750 },
      ],
    });
  });

  it("splits what nobody has edited evenly", () => {
    const request = toCreateExpenseRequest(
      advanced({ payerIds: [A, B], method: "exact" }),
      A
    );
    expect(request?.payers).toEqual([
      { userId: A, amountCents: 5000 },
      { userId: B, amountCents: 5000 },
    ]);
    expect(request?.allocation).toEqual({
      method: "exact",
      participants: [
        { userId: A, amountCents: 3334 },
        { userId: B, amountCents: 3333 },
        { userId: C, amountCents: 3333 },
      ],
    });
  });

  it("reads missing shares as 1 and empty adjustments as none", () => {
    expect(
      toCreateExpenseRequest(
        advanced({
          method: "shares",
          splits: splits({ shares: { [B]: "2" } }),
        }),
        A
      )?.allocation.participants
    ).toEqual([
      { userId: A, shares: 1 },
      { userId: B, shares: 2 },
      { userId: C, shares: 1 },
    ]);
    expect(
      toCreateExpenseRequest(
        advanced({
          method: "adjustment",
          splits: splits({ adjustment: { [A]: "+5", [B]: "-5", [C]: " " } }),
        }),
        A
      )?.allocation.participants
    ).toEqual([
      { userId: A, adjustmentCents: 500 },
      { userId: B, adjustmentCents: -500 },
      { userId: C, adjustmentCents: 0 },
    ]);
  });

  it("has nothing to send while a row doesn't parse", () => {
    expect(
      toCreateExpenseRequest(advanced({ payerAmounts: { [A]: "abc" } }), A)
    ).toBeNull();
  });
});

describe("payerAmountInputs and splitInputs", () => {
  it("show an even split until one is edited", () => {
    expect(payerAmountInputs(advanced({ payerIds: [A, C] }))).toEqual({
      [A]: "50.00",
      [C]: "50.00",
    });
    expect(splitInputs(advanced(), "percentage")).toEqual({
      [A]: "33.34",
      [B]: "33.33",
      [C]: "33.33",
    });
    expect(splitInputs(advanced(), "exact")).toEqual({
      [A]: "33.34",
      [B]: "33.33",
      [C]: "33.33",
    });
    expect(splitInputs(advanced({ amount: "" }), "exact")).toEqual({
      [A]: "",
      [B]: "",
      [C]: "",
    });
  });

  it("show what was typed once edited, and blanks for anyone new", () => {
    expect(
      payerAmountInputs(
        advanced({ payerIds: [A, B], payerAmounts: { [A]: "100" } })
      )
    ).toEqual({ [A]: "100", [B]: "" });
    expect(
      splitInputs(
        advanced({ splits: splits({ percentage: { [A]: "100" } }) }),
        "percentage"
      )
    ).toEqual({ [A]: "100", [B]: "", [C]: "" });
    expect(splitInputs(advanced(), "shares")).toEqual({
      [A]: "1",
      [B]: "1",
      [C]: "1",
    });
  });
});

describe("formatPercentage", () => {
  it.each([
    [3334, "33.34"],
    [3330, "33.3"],
    [5000, "50"],
    [10_000, "100"],
    [5, "0.05"],
  ])("shows %i basis points as %s", (basisPoints, text) => {
    expect(formatPercentage(basisPoints)).toBe(text);
  });
});

describe("advanced previewShares", () => {
  it.each([
    [
      "percentage",
      { percentage: { [A]: "50", [B]: "25", [C]: "25" } },
      [5000, 2500, 2500],
    ],
    ["shares", { shares: { [A]: "2" } }, [5000, 2500, 2500]],
    [
      "exact",
      { exact: { [A]: "10", [B]: "20", [C]: "70" } },
      [1000, 2000, 7000],
    ],
    [
      "adjustment",
      { adjustment: { [A]: "10", [B]: "-5" } },
      // 95.00 split equally, then +10 and -5.
      [4167, 2667, 3166],
    ],
  ] as const)("uses the engine for %s", (method, typed, amounts) => {
    expect(
      previewShares(advanced({ method, splits: splits(typed) }))?.map(
        ({ amountCents }) => amountCents
      )
    ).toEqual(amounts);
  });

  it.each([
    ["percentages short of 100%", "percentage", { percentage: { [A]: "50" } }],
    ["exact amounts short of the total", "exact", { exact: { [A]: "10" } }],
    ["a negative share", "adjustment", { adjustment: { [A]: "200" } }],
    ["shares that don't parse", "shares", { shares: { [A]: "1.5" } }],
  ] as const)("shows nothing for %s", (_, method, typed) => {
    expect(
      previewShares(advanced({ method, splits: splits(typed) }))
    ).toBeNull();
  });
});

describe("fitsSimpleMode", () => {
  it("fits while the user pays it all, split equally", () => {
    expect(fitsSimpleMode(advanced(), A)).toBe(true);
    expect(
      fitsSimpleMode(advanced({ payerAmounts: { [A]: "100.00" } }), A)
    ).toBe(true);
    expect(fitsSimpleMode(advanced({ amount: "" }), A)).toBe(true);
  });

  it.each([
    ["another payer", { payerIds: [A, B] }],
    ["someone else paying", { payerIds: [B] }],
    ["the user paying part", { payerAmounts: { [A]: "50" } }],
    ["another method", { method: "shares" as const }],
  ])("doesn't fit with %s", (_, overrides) => {
    expect(fitsSimpleMode(advanced(overrides), A)).toBe(false);
  });
});

describe("running checks", () => {
  it("say how much of the amount the payers leave unassigned", () => {
    const paid = (payerAmounts: Record<string, string>) =>
      payersCheck(advanced({ payerIds: [A, B], payerAmounts }))?.text.replace(
        /\s/g,
        " "
      );
    expect(paid({ [A]: "60" })).toBe("PLN 40.00 unassigned.");
    expect(paid({ [A]: "60", [B]: "50" })).toBe("PLN 10.00 over the amount.");
    expect(paid({ [A]: "60", [B]: "40" })).toBe("Adds up to the amount.");
    expect(payersCheck(advanced({ amount: "" }))).toBeNull();
  });

  it("say what's left to 100% or the total", () => {
    expect(
      splitCheck(
        advanced({
          method: "percentage",
          splits: splits({ percentage: { [A]: "50", [B]: "16.67" } }),
        }),
        nameOf
      )
    ).toEqual({ ok: false, text: "33.33% unassigned." });
    expect(splitCheck(advanced({ method: "percentage" }), nameOf)).toEqual({
      ok: true,
      text: "Adds up to 100%.",
    });
    expect(
      splitCheck(
        advanced({
          method: "exact",
          splits: splits({ exact: { [A]: "100", [B]: "5" } }),
        }),
        nameOf
      )?.text.replace(/\s/g, " ")
    ).toBe("PLN 5.00 over the amount.");
  });

  it("count the shares", () => {
    expect(
      splitCheck(
        advanced({
          method: "shares",
          splits: splits({ shares: { [A]: "3" } }),
        }),
        nameOf
      )
    ).toEqual({ ok: true, text: "5 shares in total." });
  });

  it("name who an adjustment leaves with a negative share", () => {
    expect(
      splitCheck(
        advanced({
          method: "adjustment",
          splits: splits({ adjustment: { [A]: "130" } }),
        }),
        nameOf
      )
    ).toEqual({
      ok: false,
      text: "Bartek and Celina would get a negative share.",
    });
    expect(
      splitCheck(
        advanced({
          method: "adjustment",
          splits: splits({ adjustment: { [A]: "10" } }),
        }),
        nameOf
      )?.text.replace(/\s/g, " ")
    ).toBe("PLN 90.00 is split equally before adjustments.");
  });

  it("have nothing to check for an equal split", () => {
    expect(splitCheck(advanced(), nameOf)).toBeNull();
  });
});

describe("advanced validateExpense", () => {
  it("accepts a valid expense", () => {
    expect(
      validateExpense(
        advanced({
          payerIds: [A, B],
          method: "percentage",
          splits: splits({ percentage: { [A]: "50", [B]: "25", [C]: "25" } }),
        }),
        A
      )
    ).toBeUndefined();
  });

  it("puts a payer's issue on their row, not the sum on the list", () => {
    expect(
      validateExpense(
        advanced({ payerIds: [A, B], payerAmounts: { [A]: "100", [B]: "x" } }),
        A
      )?.fields
    ).toEqual({ [`payerAmounts.${B}`]: "Enter a number, like 12.50." });
    expect(
      validateExpense(
        advanced({ payerIds: [A, B], payerAmounts: { [A]: "100", [B]: "0" } }),
        A
      )?.fields
    ).toEqual({ [`payerAmounts.${B}`]: "Enter an amount above zero." });
  });

  it("says when the payers don't add up or there are none", () => {
    expect(
      validateExpense(advanced({ payerAmounts: { [A]: "90" } }), A)?.fields
    ).toEqual({ payerIds: "What everyone paid must add up to the amount." });
    expect(validateExpense(advanced({ payerIds: [] }), A)?.fields).toEqual({
      payerIds: "Pick at least one person who paid.",
    });
  });

  it("puts each method's issues on the row or the list", () => {
    expect(
      validateExpense(
        advanced({
          method: "percentage",
          splits: splits({ percentage: { [A]: "100", [B]: "0", [C]: "" } }),
        }),
        A
      )?.fields
    ).toEqual({
      [`splits.percentage.${B}`]: "Enter a percentage above 0, up to 100.",
      [`splits.percentage.${C}`]: "Enter a percentage.",
    });
    expect(
      validateExpense(
        advanced({
          method: "percentage",
          splits: splits({ percentage: { [A]: "50", [B]: "20", [C]: "20" } }),
        }),
        A
      )?.fields
    ).toEqual({ participantIds: "Percentages must add up to 100%." });
    expect(
      validateExpense(
        advanced({
          method: "exact",
          splits: splits({ exact: { [A]: "50", [B]: "20", [C]: "20" } }),
        }),
        A
      )?.fields
    ).toEqual({ participantIds: "Amounts must add up to the amount." });
    expect(
      validateExpense(
        advanced({
          method: "shares",
          splits: splits({ shares: { [B]: "1000001" } }),
        }),
        A
      )?.fields
    ).toEqual({
      [`splits.shares.${B}`]: "Enter a whole number from 1 to 1,000,000.",
    });
    expect(
      validateExpense(
        advanced({
          method: "adjustment",
          splits: splits({ adjustment: { [A]: "130" } }),
        }),
        A
      )?.fields
    ).toEqual({
      [`splits.adjustment.${B}`]: "This would leave them a negative share.",
      [`splits.adjustment.${C}`]: "This would leave them a negative share.",
    });
  });

  it("checks each list even while a row in the other doesn't parse", () => {
    expect(
      validateExpense(
        advanced({
          payerIds: [A, B],
          payerAmounts: { [A]: "90", [B]: "abc" },
          method: "adjustment",
          splits: splits({ adjustment: { [A]: "130" } }),
        }),
        A
      )?.fields
    ).toEqual({
      [`payerAmounts.${B}`]: "Enter a number, like 12.50.",
      [`splits.adjustment.${B}`]: "This would leave them a negative share.",
      [`splits.adjustment.${C}`]: "This would leave them a negative share.",
    });
    expect(
      validateExpense(
        advanced({
          payerAmounts: { [A]: "90" },
          method: "shares",
          splits: splits({ shares: { [B]: "x" } }),
        }),
        A
      )?.fields
    ).toEqual({
      payerIds: "What everyone paid must add up to the amount.",
      [`splits.shares.${B}`]: "Enter a whole number, like 2.",
    });
  });

  it("only asks for the amount while even splits have nothing to split", () => {
    expect(
      validateExpense(
        advanced({ amount: "", payerIds: [A, B], method: "exact" }),
        A
      )?.fields
    ).toEqual({ amount: "Enter an amount." });
  });
});

describe("advanced createExpenseServerErrors", () => {
  it("names the payers who left on the payer list", () => {
    expect(
      createExpenseServerErrors(
        invalidReference([["payers", 1, "userId"]]),
        advanced({ payerIds: [A, B] }),
        nameOf
      )
    ).toEqual({
      fields: {
        payerIds: "Bartek left the household. Uncheck them to save.",
      },
    });
  });

  it("puts a row's issue on that row", () => {
    const error = ApiRequestError.fromBody("api", 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      details: {
        issues: [
          {
            path: ["allocation", "participants", 2, "adjustmentCents"],
            message: "Adjustment results in a negative share",
          },
          { path: ["payers", 0, "amountCents"], message: "Too small" },
        ],
      },
    });
    expect(
      createExpenseServerErrors(
        error,
        advanced({ payerIds: [B], method: "adjustment" }),
        nameOf
      )
    ).toEqual({
      fields: {
        [`splits.adjustment.${C}`]: "Adjustment results in a negative share",
        [`payerAmounts.${B}`]: "Too small",
      },
    });
  });
});
