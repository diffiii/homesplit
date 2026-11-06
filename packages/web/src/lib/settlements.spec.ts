import { describe, expect, it } from "vitest";
import {
  describeBalance,
  describeTransfer,
  forgivePayments,
  PaymentFormValues,
  splitPayments,
  toPaymentRequest,
} from "./settlements";

const person = (id: string) => ({ id, name: id, imageUrl: null });
const [a, b, c, d] = ["a", "b", "c", "d"].map(person);
const balance = (user: typeof a, amountCents: number) => ({
  user,
  amountCents,
});
const summary = (payments: ReturnType<typeof forgivePayments>) =>
  payments.map(({ payer, payee, amountCents }) => [
    payer.id,
    payee.id,
    amountCents,
  ]);

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

describe("forgivePayments", () => {
  it("settles the decision record's example", () => {
    const subject = balance(d, -3000);
    expect(
      summary(
        forgivePayments(subject, [
          balance(a, 3000),
          balance(b, 0),
          balance(c, 0),
          subject,
        ])
      )
    ).toEqual([["d", "a", 3000]]);
  });

  it("pays the largest creditor first, up to what each is owed", () => {
    const subject = balance(d, -3000);
    expect(
      summary(
        forgivePayments(subject, [
          balance(a, 1000),
          balance(b, 2000),
          balance(c, 500),
          subject,
        ])
      )
    ).toEqual([
      ["d", "b", 2000],
      ["d", "a", 1000],
    ]);
  });

  it("breaks ties by ID, like the backend", () => {
    const subject = balance(d, -3000);
    expect(
      summary(
        forgivePayments(subject, [balance(b, 2000), balance(a, 2000), subject])
      )
    ).toEqual([
      ["d", "a", 2000],
      ["d", "b", 1000],
    ]);
  });

  it("has the debtors pay someone who left while owed money", () => {
    const subject = balance(d, 3000);
    expect(
      summary(
        forgivePayments(subject, [
          balance(a, -1000),
          balance(b, -2000),
          subject,
        ])
      )
    ).toEqual([
      ["b", "d", 2000],
      ["a", "d", 1000],
    ]);
  });
});

describe("splitPayments", () => {
  it("settles the decision record's example", () => {
    expect(summary(splitPayments(balance(d, -3000), [a, b, c]))).toEqual([
      ["d", "a", 1000],
      ["d", "b", 1000],
      ["d", "c", 1000],
    ]);
  });

  it("adds up to the balance when it doesn't divide evenly", () => {
    const payments = splitPayments(balance(d, -1000), [a, b, c]);
    expect(payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(1000);
  });

  it("records nothing for a share that rounds to zero", () => {
    expect(splitPayments(balance(d, -1), [a, b, c])).toHaveLength(1);
  });

  it("has each member pay someone who left while owed money", () => {
    expect(summary(splitPayments(balance(d, 2000), [a, b]))).toEqual([
      ["a", "d", 1000],
      ["b", "d", 1000],
    ]);
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
