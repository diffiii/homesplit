import type { MemberBalance, SettlementSuggestion } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import { suggestSettlements } from "./settlement-suggestions";

const user = (id: string) => ({ id, name: id, imageUrl: null });

/** Balances keyed by user ID, which doubles as the name. */
const balances = (amounts: Record<string, number>): MemberBalance[] =>
  Object.entries(amounts).map(([id, amountCents]) => ({
    user: user(id),
    amountCents,
  }));

const compact = (suggestions: SettlementSuggestion[]) =>
  suggestions.map(
    ({ payer, payee, amountCents }) => `${payer.id}->${payee.id}:${amountCents}`
  );

/** Each user's balance after every suggestion is recorded as a payment. */
function apply(input: MemberBalance[], suggestions: SettlementSuggestion[]) {
  const after = new Map(
    input.map(({ user: { id }, amountCents }) => [id, amountCents])
  );
  for (const { payer, payee, amountCents } of suggestions) {
    after.set(payer.id, (after.get(payer.id) ?? 0) + amountCents);
    after.set(payee.id, (after.get(payee.id) ?? 0) - amountCents);
  }
  return [...after.values()];
}

/** Park–Miller, so failures reproduce; products stay below 2^53. */
function random(seed: number) {
  let state = seed;
  return (below: number) => {
    state = (state * 48_271) % 2_147_483_647;
    return state % below;
  };
}

/** Zero-sum balances for `count` users, with repeated amounts likely. */
function randomBalances(next: (below: number) => number, count: number) {
  const amounts = Array.from({ length: count }, () => (next(7) - 3) * 100);
  amounts[count - 1] -= amounts.reduce((total, amount) => total + amount, 0);
  return amounts.map((amountCents, index) => ({
    user: user(`u${String(index).padStart(2, "0")}`),
    amountCents,
  }));
}

function shuffle<T>(next: (below: number) => number, items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = next(index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

describe("suggestSettlements", () => {
  it("suggests nothing for no balances or only zero ones", () => {
    expect(suggestSettlements([])).toEqual([]);
    expect(suggestSettlements(balances({ a: 0, b: 0 }))).toEqual([]);
  });

  it("walks creditors and debtors from the largest down", () => {
    const suggestions = suggestSettlements(
      balances({ a: 600, b: 300, c: -450, d: -150, e: -300, f: 0 })
    );

    expect(compact(suggestions)).toEqual([
      "c->a:450",
      "e->a:150",
      "e->b:150",
      "d->b:150",
    ]);
  });

  it("breaks ties by user ID, whatever the input order", () => {
    const expected = ["c->a:100", "d->b:100"];

    expect(
      compact(
        suggestSettlements(balances({ a: 100, b: 100, c: -100, d: -100 }))
      )
    ).toEqual(expected);
    expect(
      compact(
        suggestSettlements(balances({ d: -100, b: 100, c: -100, a: 100 }))
      )
    ).toEqual(expected);
  });

  it("handles amounts beyond 32 bits", () => {
    const big = Number.MAX_SAFE_INTEGER;

    expect(compact(suggestSettlements(balances({ a: big, b: -big })))).toEqual([
      `b->a:${big}`,
    ]);
  });

  it("rejects balances that don't add up to zero", () => {
    expect(() => suggestSettlements(balances({ a: 100, b: -50 }))).toThrow();
  });

  it("settles random balances with positive transfers between distinct users, stably", () => {
    const next = random(42);
    for (let run = 0; run < 500; run += 1) {
      const input = randomBalances(next, 2 + next(12));
      const suggestions = suggestSettlements(input);
      const nonZero = input.filter(({ amountCents }) => amountCents !== 0);

      expect(apply(input, suggestions).every((amount) => amount === 0)).toBe(
        true
      );
      for (const { payer, payee, amountCents } of suggestions) {
        expect(amountCents).toBeGreaterThan(0);
        expect(payer.id).not.toBe(payee.id);
      }
      expect(suggestions.length).toBeLessThanOrEqual(
        Math.max(nonZero.length - 1, 0)
      );
      expect(suggestSettlements(shuffle(next, input))).toEqual(suggestions);
    }
  });
});
