import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Money } from "../../common/money";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { UserSummary } from "../users";

/**
 * Computed household balance for one member.
 * Positive = creditor (owed); negative = debtor.
 */
export const Balance = z.object({
  user: UserSummary,
  balance: Money,
});
export type Balance = z.infer<typeof Balance>;

/** Path params for listing balances in a household. */
export const ListBalancesParams = z.object({
  householdId: Id,
});
export type ListBalancesParams = z.infer<typeof ListBalancesParams>;

/** Unpaginated balance list (one entry per household member). */
export const BalanceListResponse = z.object({
  items: z.array(Balance),
});
export type BalanceListResponse = z.infer<typeof BalanceListResponse>;

/** Ledger entry recording a payment from payer to payee. */
export const Settlement = z.object({
  id: Id,
  householdId: Id,
  payer: UserSummary,
  payee: UserSummary,
  createdBy: UserSummary,
  amount: Money,
  note: z.string().min(1).nullable(),
  createdAt: IsoDateTime,
});
export type Settlement = z.infer<typeof Settlement>;

/** Suggested transfer to reduce outstanding balances. */
export const SettlementSuggestion = z.object({
  payer: UserSummary,
  payee: UserSummary,
  amount: Money,
});
export type SettlementSuggestion = z.infer<typeof SettlementSuggestion>;

/** Record a settlement payment; createdBy is the authenticated user. */
export const ProcessSettlementRequest = z.object({
  payerId: Id,
  payeeId: Id,
  amount: Money,
  note: z.string().min(1).nullable().optional(),
});
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

/** Unpaginated settlement suggestion list. */
export const SettlementSuggestionListResponse = z.object({
  items: z.array(SettlementSuggestion),
});
export type SettlementSuggestionListResponse = z.infer<
  typeof SettlementSuggestionListResponse
>;

/** Paginated settlement history response. */
export const SettlementListResponse = paginatedResponse(Settlement);
export type SettlementListResponse = z.infer<typeof SettlementListResponse>;

/** Response for processing a settlement. */
export type ProcessSettlementResponse = Settlement;
