import {
  allocate,
  type BalanceListResponse,
  type SettlementSuggestion,
  type SettlementSuggestionListResponse,
  type UserBalanceListResponse,
} from "@homesplit/contracts";
import type { MockDb } from "../db";
import { asc, desc, sortBy } from "./shared";

/** Balance by currency, then by user: paid − allocated + payments sent − received. */
type Ledger = Map<string, Map<string, number>>;

function add(ledger: Ledger, currency: string, userId: string, amount: number) {
  let users = ledger.get(currency);
  if (!users) {
    users = new Map();
    ledger.set(currency, users);
  }
  users.set(userId, (users.get(userId) ?? 0) + amount);
}

/** Only confirmed payments count, as in the backend's ledger. */
function householdLedger(db: MockDb, householdId: string): Ledger {
  const ledger: Ledger = new Map();
  for (const expense of db.state.expenses) {
    if (expense.householdId !== householdId) {
      continue;
    }
    const { currency, amountCents } = expense.total;
    for (const payer of expense.payers) {
      add(ledger, currency, payer.userId, payer.amountCents);
    }
    for (const split of allocate(amountCents, expense.allocation)) {
      add(ledger, currency, split.userId, -split.amountCents);
    }
  }
  for (const settlement of db.state.settlements) {
    if (settlement.householdId !== householdId || !settlement.confirmedAt) {
      continue;
    }
    const { currency, amountCents } = settlement.amount;
    add(ledger, currency, settlement.payerId, amountCents);
    add(ledger, currency, settlement.payeeId, -amountCents);
  }
  return ledger;
}

function nonZero(users: Map<string, number>) {
  return [...users].filter(([, amount]) => amount !== 0);
}

/** Currencies with a non-zero balance, by code. */
function openCurrencies(ledger: Ledger) {
  return [...ledger]
    .filter(([, users]) => nonZero(users).length > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));
}

/** `GET /balances`: every current member, and departed members who aren't at zero. */
export function listBalances(
  db: MockDb,
  householdId: string
): BalanceListResponse {
  const memberIds = db.members(householdId).map(({ userId }) => userId);
  return {
    items: openCurrencies(householdLedger(db, householdId)).map(
      ([currency, users]) => {
        const userIds = new Set([
          ...memberIds,
          ...nonZero(users).map(([id]) => id),
        ]);
        const balances = [...userIds].map((userId) => ({
          userId,
          amountCents: users.get(userId) ?? 0,
        }));
        return {
          currency,
          balances: sortBy(
            balances,
            desc((balance) => balance.amountCents),
            asc((balance) => balance.userId)
          ).map(({ userId, amountCents }) => ({
            user: db.summary(userId),
            amountCents,
          })),
        };
      }
    ),
  };
}

/** The backend's greedy walk: the largest debtor pays the largest creditor, and so on. */
export function suggestSettlements(
  db: MockDb,
  householdId: string
): SettlementSuggestionListResponse {
  return {
    items: openCurrencies(householdLedger(db, householdId)).map(
      ([currency, users]) => {
        const order = (rows: [string, number][]) =>
          sortBy(
            rows,
            desc(([, amount]) => amount),
            asc(([userId]) => userId)
          );
        const balances = nonZero(users);
        const creditors = order(balances.filter(([, amount]) => amount > 0));
        const debtors = order(
          balances
            .filter(([, amount]) => amount < 0)
            .map(([userId, amount]) => [userId, -amount])
        );
        const suggestions: SettlementSuggestion[] = [];
        let c = 0;
        let d = 0;
        while (c < creditors.length && d < debtors.length) {
          const amountCents = Math.min(creditors[c][1], debtors[d][1]);
          suggestions.push({
            payer: db.summary(debtors[d][0]),
            payee: db.summary(creditors[c][0]),
            amountCents,
          });
          creditors[c][1] -= amountCents;
          debtors[d][1] -= amountCents;
          if (creditors[c][1] === 0) {
            c += 1;
          }
          if (debtors[d][1] === 0) {
            d += 1;
          }
        }
        return { currency, suggestions };
      }
    ),
  };
}

/** `GET /api/me/balances`: the user's balances in the households they're a current member of. */
export function listMyBalances(
  db: MockDb,
  userId: string
): UserBalanceListResponse {
  const byCurrency = new Map<
    string,
    { householdId: string; amountCents: number }[]
  >();
  for (const { householdId } of db.state.members.filter(
    (member) => member.userId === userId
  )) {
    for (const [currency, users] of householdLedger(db, householdId)) {
      const amountCents = users.get(userId) ?? 0;
      if (amountCents !== 0) {
        byCurrency.set(currency, [
          ...(byCurrency.get(currency) ?? []),
          { householdId, amountCents },
        ]);
      }
    }
  }
  return {
    items: [...byCurrency]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([currency, households]) => ({
        currency,
        amountCents: households.reduce((sum, row) => sum + row.amountCents, 0),
        households: sortBy(
          households,
          desc((row) => row.amountCents),
          asc((row) => row.householdId)
        ).map(({ householdId, amountCents }) => {
          const household = db.household(householdId);
          return {
            household: { id: householdId, name: household?.name ?? "" },
            amountCents,
          };
        }),
      })),
  };
}

/** Whether anyone's balance, or only `userId`'s when given, isn't zero. */
export function hasUnsettledBalances(
  db: MockDb,
  householdId: string,
  userId?: string
): boolean {
  for (const users of householdLedger(db, householdId).values()) {
    for (const [id, amount] of users) {
      if (amount !== 0 && (userId === undefined || id === userId)) {
        return true;
      }
    }
  }
  return false;
}
