import {
  allocate,
  type Cents,
  CurrencyCode,
  MAX_AMOUNT_CENTS,
  type MemberBalance,
  type ProcessSettlementRequest,
  type UserSummary,
} from "@homesplit/contracts";
import { z } from "zod";
import { amountError, formatMoney, parseAmount } from "./money";

/** Marks a payment as a write-off; only this note tells it apart in the history. */
export const WRITE_OFF_NOTE = "Write-off";

/** A payment a write-off would record. */
export interface PlannedPayment {
  amountCents: Cents;
  payee: UserSummary;
  payer: UserSummary;
}

/** What a balance means, for the user's own row or someone else's. */
export function describeBalance(
  amountCents: Cents,
  currency: string,
  { you }: { you: boolean }
): string {
  if (amountCents === 0) {
    return you ? "You're settled up" : "Settled up";
  }
  const amount = formatMoney({ amountCents: Math.abs(amountCents), currency });
  if (amountCents < 0) {
    return you ? `You owe ${amount}` : `Owes ${amount}`;
  }
  return you ? `You're owed ${amount}` : `Is owed ${amount}`;
}

/** `Bartek pays you`, in the words of whoever is reading it. */
export function describeTransfer(
  { payer, payee }: Pick<PlannedPayment, "payer" | "payee">,
  userId: string
): string {
  if (payer.id === userId) {
    return `You pay ${payee.name}`;
  }
  return `${payer.name} pays ${payee.id === userId ? "you" : payee.name}`;
}

/**
 * Forgive `subject`'s balance: payments between them and the people on the
 * other side, up to what each is owed or owes, largest first, like the
 * backend's suggestions. See "Writing off debts" in docs/decisions.md.
 */
export function forgivePayments(
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
 * Split `subject`'s balance: one payment with each of `members`, an equal
 * share each, using the shared engine's rounding. A share that rounds to
 * nothing records no payment.
 */
export function splitPayments(
  subject: MemberBalance,
  members: readonly UserSummary[]
): PlannedPayment[] {
  const owes = subject.amountCents < 0;
  const shares = allocate(Math.abs(subject.amountCents), {
    method: "equal",
    participants: members.map(({ id }) => ({ userId: id })),
  });
  return members.flatMap((member) => {
    const share = shares.find(({ userId }) => userId === member.id);
    return share && share.amountCents > 0
      ? [transfer(subject.user, member, share.amountCents, owes)]
      : [];
  });
}

const transfer = (
  subject: UserSummary,
  other: UserSummary,
  amountCents: Cents,
  subjectPays: boolean
): PlannedPayment =>
  subjectPays
    ? { payer: subject, payee: other, amountCents }
    : { payer: other, payee: subject, amountCents };

/**
 * The payment form's rules, on what was typed. The server has the last word on
 * who may record what; the form only offers what it allows.
 */
export const PaymentFormValues = z
  .object({
    payerId: z.string().min(1, "Pick who paid."),
    payeeId: z.string().min(1, "Pick who got paid."),
    amount: z.string(),
    currency: CurrencyCode,
    note: z.string(),
  })
  .superRefine(({ amount, currency }, ctx) => {
    const message = paymentAmountError(amount, currency);
    if (message) {
      ctx.addIssue({ code: "custom", message, path: ["amount"] });
    }
  });
export type PaymentFormValues = z.infer<typeof PaymentFormValues>;

function paymentAmountError(
  amount: string,
  currency: string
): string | undefined {
  const parsed = parseAmount(amount, currency);
  if (!parsed.ok) {
    return amountError(amount, currency);
  }
  if (parsed.cents === 0) {
    return "Enter an amount above zero.";
  }
  return parsed.cents > MAX_AMOUNT_CENTS
    ? "That amount is too large."
    : undefined;
}

/** The request for values that passed `PaymentFormValues`. A blank note is left out. */
export function toPaymentRequest(
  values: PaymentFormValues
): ProcessSettlementRequest {
  const parsed = parseAmount(values.amount, values.currency);
  if (!parsed.ok) {
    throw new Error("The payment form let an invalid amount through");
  }
  const note = values.note.trim();
  return {
    payerId: values.payerId,
    payeeId: values.payeeId,
    amount: { amountCents: parsed.cents, currency: values.currency },
    ...(note ? { note } : {}),
  };
}
