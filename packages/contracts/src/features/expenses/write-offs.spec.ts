import { describe, expect, it } from "vitest";
import { planWriteOff, WriteOffRequest } from "./write-offs";

const user = (name: string, id: string) => ({ id, name, imageUrl: null });
const A = user("A", "00000000-0000-4000-8000-00000000000a");
const B = user("B", "00000000-0000-4000-8000-00000000000b");
const C = user("C", "00000000-0000-4000-8000-00000000000c");
const D = user("D", "00000000-0000-4000-8000-00000000000d");

const amounts = (payments: ReturnType<typeof planWriteOff>) =>
  payments.map(({ payer, payee, amountCents }) => [
    payer.name,
    payee.name,
    amountCents,
  ]);

describe("planWriteOff", () => {
  // The example in "Writing off debts" in docs/decisions.md.
  const d = { user: D, amountCents: -3000 };
  const balances = [{ user: A, amountCents: 3000 }, d];

  it("forgives a debt with payments to the creditors", () => {
    expect(amounts(planWriteOff("forgive", d, balances, [A, B, C]))).toEqual([
      ["D", "A", 3000],
    ]);
  });

  it("splits a debt equally among current members", () => {
    expect(amounts(planWriteOff("split", d, balances, [A, B, C]))).toEqual([
      ["D", "A", 1000],
      ["D", "B", 1000],
      ["D", "C", 1000],
    ]);
  });

  it("pays a departed creditor, largest debtor first", () => {
    const owed = { user: D, amountCents: 500 };
    const all = [
      owed,
      { user: A, amountCents: -200 },
      { user: B, amountCents: -300 },
    ];
    expect(amounts(planWriteOff("forgive", owed, all, [A, B]))).toEqual([
      ["B", "D", 300],
      ["A", "D", 200],
    ]);
  });

  it("rounds a split like allocate and skips empty shares", () => {
    const tiny = { user: D, amountCents: -2 };
    expect(amounts(planWriteOff("split", tiny, [], [A, B, C]))).toEqual([
      ["D", "A", 1],
      ["D", "B", 1],
    ]);
  });

  it("splits balances above one payment's limit", () => {
    const huge = { user: D, amountCents: -2_000_000_000_000 };
    expect(amounts(planWriteOff("split", huge, [], [A, B]))).toEqual([
      ["D", "A", 1_000_000_000_000],
      ["D", "B", 1_000_000_000_000],
    ]);
  });
});

describe("WriteOffRequest", () => {
  it("rejects a zero balance", () => {
    expect(
      WriteOffRequest.safeParse({
        userId: D.id,
        currency: "PLN",
        method: "split",
        amountCents: 0,
      }).success
    ).toBe(false);
  });
});
