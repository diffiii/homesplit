import { z } from "zod";

/** Amount in minor units without a currency. */
export const Cents = z.int();
export type Cents = z.infer<typeof Cents>;

/** Strictly positive amount in minor units (payments, totals). */
export const PositiveCents = z.int().positive();
export type PositiveCents = z.infer<typeof PositiveCents>;

/**
 * Signed monetary amount in minor units (e.g. cents) plus ISO 4217 currency.
 * Use for balances, where the sign carries meaning.
 */
export const Money = z.object({
  amountCents: Cents,
  currency: z.currencyCode(),
});
export type Money = z.infer<typeof Money>;

/** Strictly positive monetary amount (expense totals, payments). */
export const PositiveMoney = Money.extend({ amountCents: PositiveCents });
export type PositiveMoney = z.infer<typeof PositiveMoney>;
