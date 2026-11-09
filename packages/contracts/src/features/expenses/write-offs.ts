import { z } from "zod";

import { distributeProportionally } from "../../common/distribute";
import { Id } from "../../common/id";
import { Cents, CurrencyCode } from "../../common/money";
import { toSafeInteger } from "../../common/safe-integer";
import type { UserSummary } from "../users";
import { ConfirmedSettlement, type MemberBalance } from "./settlements";

/** The note on every payment a write-off records. */
export const WRITE_OFF_NOTE = "Write-off";

/**
 * `forgive`: the people on the other side of the balance take the loss.
 * `split`: every current member takes an equal share of it.
 */
export const WriteOffMethod = z.enum(["forgive", "split"]);
export type WriteOffMethod = z.infer<typeof WriteOffMethod>;

/**
 * Write off a departed member's balance in one currency. `amountCents` is the
 * balance the caller saw; the server answers 409 `BALANCE_CHANGED` when it
 * isn't the balance now, so a repeated request records nothing.
 */
export const WriteOffRequest = z.strictObject({
  userId: Id,
  currency: CurrencyCode,
  method: WriteOffMethod,
  amountCents: Cents.refine((cents) => cents !== 0, "Must not be zero"),
});
export type WriteOffRequest = z.infer<typeof WriteOffRequest>;

/** The payments a write-off recorded, all confirmed. */
export const WriteOffResponse = z.object({
  items: z.array(ConfirmedSettlement),
});
export type WriteOffResponse = z.infer<typeof WriteOffResponse>;

/** A payment a write-off records. */
export interface PlannedPayment {
  amountCents: Cents;
  payee: UserSummary;
  payer: UserSummary;
}

const transfer = (
  subject: UserSummary,
  other: UserSummary,
  amountCents: number,
  subjectPays: boolean
): PlannedPayment =>
  subjectPays
    ? { payer: subject, payee: other, amountCents }
    : { payer: other, payee: subject, amountCents };

/**
 * Forgive `subject`'s balance: payments between them and the people on the
 * other side, up to what each is owed or owes, largest first, ties by user ID.
 */
function forgive(
  subject: MemberBalance,
  balances: readonly MemberBalance[]
): PlannedPayment[] {
  const owes = subject.amountCents < 0;
  const others = balances
    .filter(({ amountCents }) => (owes ? amountCents > 0 : amountCents < 0))
    .sort(
      (a, b) =>
        Math.abs(b.amountCents) - Math.abs(a.amountCents) ||
        (a.user.id < b.user.id ? -1 : 1)
    );
  const payments: PlannedPayment[] = [];
  let left = Math.abs(subject.amountCents);
  for (const { user, amountCents } of others) {
    if (left === 0) {
      break;
    }
    const amount = Math.min(left, Math.abs(amountCents));
    payments.push(transfer(subject.user, user, amount, owes));
    left -= amount;
  }
  return payments;
}

/**
 * Split `subject`'s balance into one payment with each of `members`, an equal
 * share each, rounded as `allocate` rounds an equal split. A share that rounds
 * to nothing records no payment.
 */
function split(
  subject: MemberBalance,
  members: readonly UserSummary[]
): PlannedPayment[] {
  if (members.length === 0) {
    return [];
  }
  const owes = subject.amountCents < 0;
  const shares = distributeProportionally(
    BigInt(Math.abs(subject.amountCents)),
    members.map(({ id }) => ({ key: id, weight: 1n }))
  );
  return members.flatMap((member, i) => {
    const amount = toSafeInteger(shares[i].amount);
    return amount > 0 ? [transfer(subject.user, member, amount, owes)] : [];
  });
}

/**
 * The payments that write off `subject`'s balance, as described in "Writing
 * off debts" in docs/decisions.md. `balances` are everyone's balances in the
 * same currency and `members` the household's current members. The server
 * records exactly these, so clients can show them first.
 */
export function planWriteOff(
  method: WriteOffMethod,
  subject: MemberBalance,
  balances: readonly MemberBalance[],
  members: readonly UserSummary[]
): PlannedPayment[] {
  if (subject.amountCents === 0) {
    return [];
  }
  return method === "forgive"
    ? forgive(subject, balances)
    : split(subject, members);
}
