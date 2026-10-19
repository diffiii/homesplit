import {
  type BalanceListResponse,
  type MemberBalance,
  type SettlementSuggestionListResponse,
  toSafeInteger,
  type UserBalanceListResponse,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { db, readSnapshot } from "@/db";
import {
  currentMembers,
  householdBalances,
  userBalances,
} from "./balances.repository";
import { suggestSettlements } from "./settlement-suggestions";

/** Groups rows by currency, keeping the order they came in. */
function groupByCurrency<T extends { currency: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    groups.set(row.currency, [...(groups.get(row.currency) ?? []), row]);
  }
  return [...groups];
}

/** Creditors first; equal balances by user ID, so they never swap places. */
const byBalance = (a: MemberBalance, b: MemberBalance) =>
  b.amountCents - a.amountCents || (a.user.id < b.user.id ? -1 : 1);

@Injectable()
export class BalancesService {
  /**
   * Lists a currency only while some balance in it isn't zero. It then has
   * every current member, at zero if need be, and each departed member whose
   * balance in it isn't zero.
   */
  listForHousehold(householdId: string): Promise<BalanceListResponse> {
    // Both reads see the same snapshot.
    return readSnapshot(async (tx) => {
      const sums = await householdBalances(tx, householdId);
      const members = await currentMembers(tx, householdId);

      const items = groupByCurrency(sums).map(([currency, rows]) => {
        const balances: MemberBalance[] = rows.map((row) => ({
          user: row.user,
          amountCents: toSafeInteger(row.amountCents),
        }));
        for (const user of members) {
          if (!balances.some((balance) => balance.user.id === user.id)) {
            balances.push({ user, amountCents: 0 });
          }
        }
        return { currency, balances: balances.sort(byBalance) };
      });
      return { items };
    });
  }

  /**
   * Suggests transfers that settle every currency with a non-zero balance,
   * computed from the balances on each request and never stored.
   */
  async listSuggestions(
    householdId: string
  ): Promise<SettlementSuggestionListResponse> {
    const sums = await householdBalances(db, householdId);

    const items = groupByCurrency(sums).map(([currency, rows]) => ({
      currency,
      suggestions: suggestSettlements(
        rows.map((row) => ({
          user: row.user,
          amountCents: toSafeInteger(row.amountCents),
        }))
      ),
    }));
    return { items };
  }

  /**
   * Lists the user's non-zero balances in their households, by currency, with
   * the sum across households.
   */
  async listForUser(userId: string): Promise<UserBalanceListResponse> {
    const sums = await userBalances(db, userId);

    const items = groupByCurrency(sums).map(([currency, rows]) => ({
      currency,
      // Summed as `bigint`, since a sum of safe integers needn't be one.
      amountCents: toSafeInteger(
        rows.reduce((total, row) => total + BigInt(row.amountCents), 0n)
      ),
      households: rows.map((row) => ({
        household: row.household,
        amountCents: toSafeInteger(row.amountCents),
      })),
    }));
    return { items };
  }
}
