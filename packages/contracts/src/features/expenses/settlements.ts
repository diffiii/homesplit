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

/** Path params for listing balances in a household. */
export const ListBalancesParams = z.object({
  householdId: Id,
});
export type ListBalancesParams = z.infer<typeof ListBalancesParams>;

/** Unpaginated balances, one entry per currency. */
export const BalanceListResponse = z.object({
  items: z.array(CurrencyBalances),
});
export type BalanceListResponse = z.infer<typeof BalanceListResponse>;

/** Ledger entry recording a payment from payer to payee. */
export const Settlement = z
  .object({
    id: Id,
    householdId: Id,
    payer: UserSummary,
    payee: UserSummary,
    createdBy: UserSummary,
    amount: PositiveMoney,
    note: z.string().min(1).nullable(),
    createdAt: IsoDateTime,
  })
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

/** Path params for listing settlement suggestions in a household. */
export const ListSettlementSuggestionsParams = z.object({
  householdId: Id,
});
export type ListSettlementSuggestionsParams = z.infer<
  typeof ListSettlementSuggestionsParams
>;

/** List settlement history with offset pagination. */
export const ListSettlementHistoryQuery = Pagination;
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
