import { distributeProportionally } from "../../common/distribute";
import type { Id } from "../../common/id";
import { toSafeInteger } from "../../common/safe-integer";

/** Why a receipt can't be split. */
export type ReceiptSplitErrorCode = "NEGATIVE_SHARE";

export class ReceiptSplitError extends Error {
  readonly code: ReceiptSplitErrorCode;

  constructor(code: ReceiptSplitErrorCode, message: string) {
    super(message);
    this.name = "ReceiptSplitError";
    this.code = code;
  }
}

/** An item as the split needs it: its cost after the line discount, and who has how many shares. */
export interface ReceiptSplitItem {
  assignments: readonly { shares: number; userId: Id }[];
  id: Id;
  totalCents: number;
}

export interface ReceiptSplitResult {
  /** One amount per assigned user, ordered by user ID. */
  amounts: { amountCents: number; userId: Id }[];
  /** What's split: the items' total minus the receipt-level discount. */
  totalCents: number;
  /** The part of `totalCents` that falls on unassigned items. */
  unassignedCents: number;
  /** Items without any assignment, in input order. */
  unassignedItemIds: Id[];
}

/** Key of the unassigned part, which no user ID can equal. */
const UNASSIGNED = "";

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

const lcm = (a: bigint, b: bigint): bigint => (a / gcd(a, b)) * b;

/**
 * Splits a receipt between the users its items are assigned to. Each item's
 * cost goes to its assignees in proportion to their shares, and the
 * receipt-level discount is spread over the items in proportion to their
 * cost. Every user's amount is kept as an exact fraction over a common
 * denominator, and rounded once with `distributeProportionally`, the
 * allocation engine's remainder rule, so the amounts, with the unassigned
 * part, add up exactly to `totalCents`.
 */
export function splitReceipt(
  items: readonly ReceiptSplitItem[],
  discountCents: number
): ReceiptSplitResult {
  const itemsTotal = items.reduce(
    (sum, item) => sum + BigInt(item.totalCents),
    0n
  );
  const total = itemsTotal - BigInt(discountCents);

  const assigned = items.filter((item) => item.assignments.length > 0);
  const shareSums = new Map(
    assigned.map((item) => [
      item.id,
      item.assignments.reduce((sum, { shares }) => sum + BigInt(shares), 0n),
    ])
  );
  const denominator = [...shareSums.values()].reduce(lcm, 1n);

  // Each weight is a user's cost times `denominator`, so all are integers.
  const weights = new Map<string, bigint>();
  const add = (key: string, weight: bigint) =>
    weights.set(key, (weights.get(key) ?? 0n) + weight);
  const unassignedItemIds: Id[] = [];
  for (const item of items) {
    const cost = BigInt(item.totalCents) * denominator;
    const shareSum = shareSums.get(item.id);
    if (shareSum === undefined) {
      unassignedItemIds.push(item.id);
      add(UNASSIGNED, cost);
      continue;
    }
    for (const { userId, shares } of item.assignments) {
      add(userId, (cost * BigInt(shares)) / shareSum);
    }
  }

  const userIds = [...weights.keys()]
    .filter((key) => key !== UNASSIGNED)
    .sort();
  for (const [key, weight] of weights) {
    if (weight < 0n) {
      throw new ReceiptSplitError(
        "NEGATIVE_SHARE",
        key === UNASSIGNED
          ? "The unassigned items cost less than nothing"
          : `User ${key} would get a negative amount`
      );
    }
  }

  const amounts = new Map<string, bigint>();
  if (itemsTotal === 0n) {
    // Nothing to weigh by: everything stays unassigned.
    amounts.set(UNASSIGNED, total);
  } else {
    const parts = distributeProportionally(
      total,
      [...weights].map(([key, weight]) => ({ key, weight }))
    );
    for (const { key, amount } of parts) {
      amounts.set(key, amount);
    }
  }

  return {
    totalCents: toSafeInteger(total),
    amounts: userIds.map((userId) => ({
      userId,
      amountCents: toSafeInteger(amounts.get(userId) ?? 0n),
    })),
    unassignedCents: toSafeInteger(amounts.get(UNASSIGNED) ?? 0n),
    unassignedItemIds,
  };
}
