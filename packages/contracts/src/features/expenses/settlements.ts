import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import {
  BoundedPositiveMoney,
  Cents,
  CurrencyCode,
  PositiveCents,
  PositiveMoney,
} from "../../common/money";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { HouseholdSummary } from "../households";
import { UserSummary } from "../users";

/** Rejects payments where payer and payee are the same user. */
function checkDistinctPaymentParties(
  payerId: Id,
  payeeId: Id,
  path: PropertyKey[],
  ctx: z.RefinementCtx
) {
  if (payerId === payeeId) {
    ctx.addIssue({
      code: "custom",
      message: "Payer and payee must be different users",
      path,
    });
  }
}

const refinePaymentUsers = (
  payment: { payer: UserSummary; payee: UserSummary },
  ctx: z.RefinementCtx
) =>
  checkDistinctPaymentParties(
    payment.payer.id,
    payment.payee.id,
    ["payee", "id"],
    ctx
  );

/**
 * Computed balance for one member in one currency.
 * Positive = creditor (owed); negative = debtor.
 */
export const MemberBalance = z.object({
  user: UserSummary,
  amountCents: Cents,
});
export type MemberBalance = z.infer<typeof MemberBalance>;

/** Member balances in a single currency; currencies are never netted. */
export const CurrencyBalances = z.object({
  currency: CurrencyCode,
  balances: z.array(MemberBalance),
});
export type CurrencyBalances = z.infer<typeof CurrencyBalances>;

/** Unpaginated balances, one entry per currency. */
export const BalanceListResponse = z.object({
  items: z.array(CurrencyBalances),
});
export type BalanceListResponse = z.infer<typeof BalanceListResponse>;

/** The session user's balance in one household and currency. */
export const UserHouseholdBalance = z.object({
  household: HouseholdSummary,
  amountCents: Cents,
});
export type UserHouseholdBalance = z.infer<typeof UserHouseholdBalance>;

/**
 * The session user's balances in a single currency across their households;
 * `amountCents` is their sum.
 */
export const UserCurrencyBalances = z.object({
  currency: CurrencyCode,
  amountCents: Cents,
  households: z.array(UserHouseholdBalance),
});
export type UserCurrencyBalances = z.infer<typeof UserCurrencyBalances>;

/** Unpaginated balances of the session user, one entry per currency. */
export const UserBalanceListResponse = z.object({
  items: z.array(UserCurrencyBalances),
});
export type UserBalanceListResponse = z.infer<typeof UserBalanceListResponse>;

/** Only confirmed payments count toward balances and suggestions. */
export const SettlementStatus = z.enum(["pending", "confirmed"]);
export type SettlementStatus = z.infer<typeof SettlementStatus>;

const SettlementBase = z.object({
  id: Id,
  householdId: Id,
  payer: UserSummary,
  payee: UserSummary,
  createdBy: UserSummary,
  amount: PositiveMoney,
  note: z.string().min(1).nullable(),
  createdAt: IsoDateTime,
});

const PendingSettlementFields = SettlementBase.extend({
  status: z.literal("pending"),
  confirmedBy: z.null(),
  confirmedAt: z.null(),
});

const ConfirmedSettlementFields = SettlementBase.extend({
  status: z.literal("confirmed"),
  confirmedBy: UserSummary,
  confirmedAt: IsoDateTime,
});

/** Payment recorded by its payer that nobody has confirmed yet. */
export const PendingSettlement =
  PendingSettlementFields.superRefine(refinePaymentUsers);
export type PendingSettlement = z.infer<typeof PendingSettlement>;

/** Payment that counts toward balances, with who confirmed it and when. */
export const ConfirmedSettlement =
  ConfirmedSettlementFields.superRefine(refinePaymentUsers);
export type ConfirmedSettlement = z.infer<typeof ConfirmedSettlement>;

/**
 * Ledger entry recording a payment from payer to payee; `status` narrows the
 * confirmation metadata.
 */
export const Settlement = z
  .discriminatedUnion("status", [
    PendingSettlementFields,
    ConfirmedSettlementFields,
  ])
  .superRefine(refinePaymentUsers);
export type Settlement = z.infer<typeof Settlement>;

/** Suggested transfer to reduce outstanding balances (currency from the group). */
export const SettlementSuggestion = z
  .object({
    payer: UserSummary,
    payee: UserSummary,
    amountCents: PositiveCents,
  })
  .superRefine(refinePaymentUsers);
export type SettlementSuggestion = z.infer<typeof SettlementSuggestion>;

/** Settlement suggestions in a single currency. */
export const CurrencySettlementSuggestions = z.object({
  currency: CurrencyCode,
  suggestions: z.array(SettlementSuggestion),
});
export type CurrencySettlementSuggestions = z.infer<
  typeof CurrencySettlementSuggestions
>;

/** Record a settlement payment; createdBy is the authenticated user. */
export const ProcessSettlementRequest = z
  .strictObject({
    payerId: Id,
    payeeId: Id,
    amount: BoundedPositiveMoney,
    note: z.string().min(1).nullable().optional(),
  })
  .superRefine((request, ctx) =>
    checkDistinctPaymentParties(
      request.payerId,
      request.payeeId,
      ["payeeId"],
      ctx
    )
  );
export type ProcessSettlementRequest = z.infer<typeof ProcessSettlementRequest>;

/**
 * List settlement history with offset pagination. `status` keeps only payments
 * in that state, so screens can show what's pending without paging through it all.
 */
export const ListSettlementHistoryQuery = Pagination.extend({
  status: SettlementStatus.optional(),
});
export type ListSettlementHistoryQuery = z.infer<
  typeof ListSettlementHistoryQuery
>;

/** Unpaginated settlement suggestions, one entry per currency. */
export const SettlementSuggestionListResponse = z.object({
  items: z.array(CurrencySettlementSuggestions),
});
export type SettlementSuggestionListResponse = z.infer<
  typeof SettlementSuggestionListResponse
>;

/** Paginated settlement history response. */
export const SettlementListResponse = paginatedResponse(Settlement);
export type SettlementListResponse = z.infer<typeof SettlementListResponse>;

/** Response for processing a settlement. */
export type ProcessSettlementResponse = Settlement;

/** Path params for settlement-scoped routes (confirm / delete). */
export const SettlementIdParams = z.object({
  householdId: Id,
  settlementId: Id,
});
export type SettlementIdParams = z.infer<typeof SettlementIdParams>;

/** Response for confirming a settlement. */
export type ConfirmSettlementResponse = ConfirmedSettlement;
