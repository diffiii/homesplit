import { describe, expect, it } from "vitest";
import {
  describeBalance,
  describeTransfer,
  PaymentFormValues,
  toPaymentRequest,
} from "./settlements";

const person = (id: string) => ({ id, name: id, imageUrl: null });
const [a, b] = ["a", "b"].map(person);

describe("describeBalance", () => {
  it.each([
    [-1200, true, "You owe PLN 12.00"],
    [1200, true, "You're owed PLN 12.00"],
    [0, true, "You're settled up"],
    [-1200, false, "Owes PLN 12.00"],
    [1200, false, "Is owed PLN 12.00"],
    [0, false, "Settled up"],
  ])("phrases %i (you: %s)", (amountCents, you, text) => {
    expect(
      describeBalance(amountCents, "PLN", { you }).replace(/ /gu, " ")
    ).toBe(text);
  });
});

describe("describeTransfer", () => {
  it("speaks to the reader", () => {
    expect(describeTransfer({ payer: a, payee: b }, "a")).toBe("You pay b");
    expect(describeTransfer({ payer: a, payee: b }, "b")).toBe("a pays you");
    expect(describeTransfer({ payer: a, payee: b }, "c")).toBe("a pays b");
  });
});

describe("the payment form's values", () => {
  const values = {
    payerId: "a",
    payeeId: "b",
    amount: "12,50",
    currency: "PLN",
    note: "  ",
  };
  const amountIssue = (amount: string, currency = "PLN") =>
    PaymentFormValues.safeParse({ ...values, amount, currency }).error
      ?.issues[0]?.message;

  it("accepts what the money input accepts and leaves a blank note out", () => {
    expect(PaymentFormValues.safeParse(values).success).toBe(true);
    expect(toPaymentRequest(values)).toEqual({
      payerId: "a",
      payeeId: "b",
      amount: { amountCents: 1250, currency: "PLN" },
    });
  });

  it("keeps a note, trimmed", () => {
    expect(toPaymentRequest({ ...values, note: " BLIK " }).note).toBe("BLIK");
  });

  it("explains an amount it can't record", () => {
    expect(amountIssue("")).toBe("Enter an amount.");
    expect(amountIssue("0")).toBe("Enter an amount above zero.");
    expect(amountIssue("-5")).toBe("Enter a number, like 12.50.");
    expect(amountIssue("1.5", "JPY")).toBe("JPY amounts have no decimals.");
    expect(amountIssue("10000000001")).toBe("That amount is too large.");
  });
});
