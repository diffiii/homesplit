import type {
  MemberBalance,
  SettlementSuggestion,
  UserSummary,
} from "@homesplit/contracts";

interface Party {
  remainingCents: number;
  user: UserSummary;
}

/** Larger amounts first; equal ones by user ID, so input order doesn't matter. */
const byAmountThenId = (a: Party, b: Party) =>
  b.remainingCents - a.remainingCents || (a.user.id < b.user.id ? -1 : 1);

const parties = (balances: MemberBalance[], sign: 1 | -1): Party[] =>
  balances
    .filter(({ amountCents }) => Math.sign(amountCents) === sign)
    .map(({ user, amountCents }) => ({
      user,
      remainingCents: Math.abs(amountCents),
    }))
    .sort(byAmountThenId);

/**
 * Greedy transfers that clear one currency's balances, which must add up to
 * zero. Creditors and debtors are each sorted by amount descending, then user
 * ID, and walked in step: the current debtor pays the current creditor the
 * smaller of what they owe and are owed, and whoever reaches zero gives way
 * to the next in their list.
 *
 * O(n log n) for n non-zero balances, with at most n − 1 transfers. That's
 * not always the fewest possible: finding those is NP-hard.
 */
export function suggestSettlements(
  balances: MemberBalance[]
): SettlementSuggestion[] {
  const creditors = parties(balances, 1);
  const debtors = parties(balances, -1);
  const suggestions: SettlementSuggestion[] = [];

  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountCents = Math.min(
      creditor.remainingCents,
      debtor.remainingCents
    );
    suggestions.push({ payer: debtor.user, payee: creditor.user, amountCents });

    creditor.remainingCents -= amountCents;
    debtor.remainingCents -= amountCents;
    if (creditor.remainingCents === 0) {
      creditorIndex += 1;
    }
    if (debtor.remainingCents === 0) {
      debtorIndex += 1;
    }
  }

  if (creditorIndex < creditors.length || debtorIndex < debtors.length) {
    throw new Error("Balances in one currency don't add up to zero");
  }
  return suggestions;
}
