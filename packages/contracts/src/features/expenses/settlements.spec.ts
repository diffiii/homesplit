import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_CENTS } from "../../common/money";
import {
  ConfirmedSettlement,
  PendingSettlement,
  ProcessSettlementRequest,
  Settlement,
} from "./settlements";

const ALICE = {
  id: "0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c",
  name: "Alice",
  imageUrl: null,
};
const BOB = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Bob",
  imageUrl: null,
};
const CREATED_AT = "2026-10-13T10:00:00.000Z";

const pending = {
  id: "5f0c3a52-8d0b-4c56-9f0e-2b1a6d7c8e9f",
  householdId: "1d2f3e4a-5b6c-4b8e-9a59-0b6f1f4e3c1a",
  payer: ALICE,
  payee: BOB,
  createdBy: ALICE,
  amount: { amountCents: 2500, currency: "PLN" },
  note: null,
  createdAt: CREATED_AT,
  status: "pending",
  confirmedBy: null,
  confirmedAt: null,
};
const confirmed = {
  ...pending,
  status: "confirmed",
  confirmedBy: BOB,
  confirmedAt: CREATED_AT,
};

describe("Settlement", () => {
  it("accepts a pending and a confirmed payment", () => {
    expect(Settlement.parse(pending)).toEqual(pending);
    expect(Settlement.parse(confirmed)).toEqual(confirmed);
    expect(PendingSettlement.parse(pending)).toEqual(pending);
    expect(ConfirmedSettlement.parse(confirmed)).toEqual(confirmed);
  });

  it.each([
    ["pending with a confirmer", { ...pending, confirmedBy: BOB }],
    ["pending with a time", { ...pending, confirmedAt: CREATED_AT }],
    ["confirmed without a confirmer", { ...confirmed, confirmedBy: null }],
    ["confirmed without a time", { ...confirmed, confirmedAt: null }],
    ["an unknown status", { ...pending, status: "rejected" }],
    ["the same payer and payee", { ...confirmed, payee: ALICE }],
  ])("rejects %s", (_, settlement) => {
    expect(Settlement.safeParse(settlement).success).toBe(false);
  });

  it("narrows by status", () => {
    expect(ConfirmedSettlement.safeParse(pending).success).toBe(false);
    expect(PendingSettlement.safeParse(confirmed).success).toBe(false);
  });
});

describe("ProcessSettlementRequest", () => {
  const request = {
    payerId: ALICE.id,
    payeeId: BOB.id,
    amount: { amountCents: MAX_AMOUNT_CENTS, currency: "PLN" },
  };

  it("accepts a payment up to the amount limit", () => {
    expect(ProcessSettlementRequest.parse(request)).toEqual(request);
  });

  it.each([
    ["a status", { status: "confirmed" }],
    ["a creator", { createdById: BOB.id }],
    ["a confirmer", { confirmedById: BOB.id }],
    ["a timestamp", { createdAt: CREATED_AT }],
  ])("rejects %s from the client", (_, extra) => {
    expect(
      ProcessSettlementRequest.safeParse({ ...request, ...extra }).success
    ).toBe(false);
  });
});
