import {
  type Cents,
  CurrencyCode,
  MAX_AMOUNT_CENTS,
  type ProcessSettlementRequest,
  type UserSummary,
} from "@homesplit/contracts";
import { z } from "zod";
import { amountError, formatMoney, parseAmount } from "./money";

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
  { payer, payee }: { payee: UserSummary; payer: UserSummary },
  userId: string
): string {
  if (payer.id === userId) {
    return `You pay ${payee.name}`;
  }
  return `${payer.name} pays ${payee.id === userId ? "you" : payee.name}`;
}

/** `Bartek paid you`, the recorded counterpart of `describeTransfer`. */
export function describePayment(
  { payer, payee }: { payee: UserSummary; payer: UserSummary },
  userId: string
): string {
  if (payer.id === userId) {
    return `You paid ${payee.name}`;
  }
  return `${payer.name} paid ${payee.id === userId ? "you" : payee.name}`;
}

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
