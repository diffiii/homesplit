import { z } from "zod";

/** Largest absolute amount, in minor units, that a request may carry. */
export const MAX_AMOUNT_CENTS = 1_000_000_000_000;

/** Largest number of shares one participant may hold in a shares split. */
export const MAX_SHARES = 1_000_000;

/**
 * ISO 4217 codes that aren't spendable currencies: codes without a minor unit
 * (precious metals, units of account, testing, no currency) and fund codes.
 */
export const UNSUPPORTED_CURRENCY_CODES: ReadonlySet<string> = new Set([
  "XAG",
  "XAU",
  "XBA",
  "XBB",
  "XBC",
  "XBD",
  "XDR",
  "XPD",
  "XPT",
  "XSU",
  "XTS",
  "XUA",
  "XXX",
  "BOV",
  "CHE",
  "CHW",
  "CLF",
  "COU",
  "MXV",
  "USN",
  "UYI",
  "UYW",
  "XAD",
]);

/** ISO 4217 code of a supported currency; see `docs/money.md`. */
export const CurrencyCode = z
  .currencyCode()
  .refine((code) => !UNSUPPORTED_CURRENCY_CODES.has(code), {
    message: "Unsupported currency",
  });
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/** Amount in minor units without a currency. */
export const Cents = z.int();
export type Cents = z.infer<typeof Cents>;

/** Strictly positive amount in minor units (payments, totals). */
export const PositiveCents = z.int().positive();
export type PositiveCents = z.infer<typeof PositiveCents>;

/** Signed request amount within `MAX_AMOUNT_CENTS` either way. */
export const BoundedCents = Cents.min(-MAX_AMOUNT_CENTS).max(MAX_AMOUNT_CENTS);
export type BoundedCents = z.infer<typeof BoundedCents>;

/** Strictly positive request amount up to `MAX_AMOUNT_CENTS`. */
export const BoundedPositiveCents = PositiveCents.max(MAX_AMOUNT_CENTS);
export type BoundedPositiveCents = z.infer<typeof BoundedPositiveCents>;

/**
 * Signed monetary amount in minor units (e.g. cents) plus ISO 4217 currency.
 * Use for balances, where the sign carries meaning.
 */
export const Money = z.object({
  amountCents: Cents,
  currency: CurrencyCode,
});
export type Money = z.infer<typeof Money>;

/** Strictly positive monetary amount (expense totals, payments). */
export const PositiveMoney = Money.extend({ amountCents: PositiveCents });
export type PositiveMoney = z.infer<typeof PositiveMoney>;

/** Strictly positive request amount up to `MAX_AMOUNT_CENTS`. */
export const BoundedPositiveMoney = Money.extend({
  amountCents: BoundedPositiveCents,
});
export type BoundedPositiveMoney = z.infer<typeof BoundedPositiveMoney>;
