import {
  type Cents,
  CurrencyCode,
  type Money,
  UNSUPPORTED_CURRENCY_CODES,
} from "@homesplit/contracts";

/** The currency new expenses use when the user hasn't picked one yet. */
export const DEFAULT_CURRENCY = "PLN";

/**
 * Supported currencies whose ISO 4217 minor unit isn't 2. `Intl` can't supply
 * the exponent: its digits come from CLDR, which shows COP, HUF, IDR, IQD, and
 * others with fewer decimals than ISO 4217 defines.
 */
const ZERO_DECIMAL_CODES = [
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
];
const THREE_DECIMAL_CODES = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
const ISO_EXPONENTS: ReadonlyMap<string, number> = new Map([
  ...ZERO_DECIMAL_CODES.map((code) => [code, 0] as const),
  ...THREE_DECIMAL_CODES.map((code) => [code, 3] as const),
]);

/** Number of minor-unit digits, so `amountCents: 1999` is 19.99 at exponent 2. */
export function currencyExponent(currency: string): number {
  return ISO_EXPONENTS.get(currency) ?? 2;
}

export type ParseAmountResult =
  | { ok: true; cents: Cents }
  | { ok: false; reason: "empty" | "invalid" | "too-precise" | "too-large" };

export interface ParseAmountOptions {
  /** Accept a leading minus, as adjustments do. */
  allowNegative?: boolean;
}

// Digits with at most one `.` or `,` as the decimal separator. Grouping
// separators aren't accepted, because `1,000` means 1.000 to a Polish user.
const AMOUNT_PATTERN = /^(-?)(\d*)(?:[.,](\d*))?$/;
const WHITESPACE = /\s/g;

/**
 * Parse what the user typed into integer minor units, using only string and
 * integer operations, so `0.1 + 0.2`-style errors can't creep in. Spaces are
 * ignored; more decimals than the currency has is an error, not a rounding.
 */
export function parseAmount(
  input: string,
  currency: string,
  { allowNegative = false }: ParseAmountOptions = {}
): ParseAmountResult {
  const text = input.replace(WHITESPACE, "");
  if (!text) {
    return { ok: false, reason: "empty" };
  }
  const match = AMOUNT_PATTERN.exec(text);
  const [, sign = "", whole = "", fraction = ""] = match ?? [];
  if (!(match && (whole || fraction)) || (sign && !allowNegative)) {
    return { ok: false, reason: "invalid" };
  }
  const exponent = currencyExponent(currency);
  if (fraction.length > exponent) {
    return { ok: false, reason: "too-precise" };
  }
  const units = BigInt(`${whole || "0"}${fraction.padEnd(exponent, "0")}`);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: "too-large" };
  }
  const cents = Number(units);
  return { ok: true, cents: sign && cents !== 0 ? -cents : cents };
}

/**
 * The amount as a plain decimal string in major units, such as `-19.99`:
 * what a money input shows for a stored amount, and what `Intl` formats.
 */
export function toDecimalString(cents: Cents, currency: string): string {
  const exponent = currencyExponent(currency);
  const digits = Math.abs(cents)
    .toString()
    .padStart(exponent + 1, "0");
  const sign = cents < 0 ? "-" : "";
  if (exponent === 0) {
    return `${sign}${digits}`;
  }
  const split = digits.length - exponent;
  return `${sign}${digits.slice(0, split)}.${digits.slice(split)}`;
}

export interface FormatMoneyOptions {
  /** `exceptZero` for balances, so a debt reads `-PLN 12.00` and a credit `+PLN 12.00`. */
  signDisplay?: Intl.NumberFormatOptions["signDisplay"];
}

const formatters = new Map<string, Intl.NumberFormat>();

/** `PLN 1,234.50`: English formatting with the currency's ISO 4217 exponent. */
export function formatMoney(
  { amountCents, currency }: Money,
  { signDisplay = "auto" }: FormatMoneyOptions = {}
): string {
  const key = `${currency}:${signDisplay}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const exponent = currencyExponent(currency);
    formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
      signDisplay,
    });
    formatters.set(key, formatter);
  }
  // A decimal string keeps `Intl` exact for amounts beyond a double's precision.
  return formatter.format(
    toDecimalString(amountCents, currency) as Intl.StringNumericLiteral
  );
}

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

/** `Polish Zloty` for `PLN`, or the code when the browser has no name for it. */
export function currencyName(currency: string): string {
  return currencyNames.of(currency) ?? currency;
}

/**
 * Codes the currency picker offers: the browser's ISO 4217 codes that the
 * contracts accept, which leaves out `UNSUPPORTED_CURRENCY_CODES`.
 */
export function supportedCurrencies(
  browserCodes: readonly string[] = Intl.supportedValuesOf("currency")
): string[] {
  return browserCodes.filter(
    (code) =>
      !UNSUPPORTED_CURRENCY_CODES.has(code) &&
      CurrencyCode.safeParse(code).success
  );
}

/**
 * Picker order: recently used currencies, most recent first, then PLN, then
 * the rest alphabetically. Recent codes that aren't supported are dropped.
 */
export function orderCurrencies(
  codes: readonly string[],
  recent: readonly string[]
): string[] {
  const available = new Set(codes);
  const first = [...new Set([...recent, DEFAULT_CURRENCY])].filter((code) =>
    available.has(code)
  );
  const pinned = new Set(first);
  const rest = codes.filter((code) => !pinned.has(code)).sort();
  return [...first, ...rest];
}

/** What to tell the user about an amount `parseAmount` rejected, or `undefined` if it's fine. */
export function amountError(
  input: string,
  currency: string,
  options?: ParseAmountOptions
): string | undefined {
  const result = parseAmount(input, currency, options);
  if (result.ok) {
    return;
  }
  switch (result.reason) {
    case "empty":
      return "Enter an amount.";
    case "invalid":
      return "Enter a number, like 12.50.";
    case "too-precise": {
      const exponent = currencyExponent(currency);
      return exponent === 0
        ? `${currency} amounts have no decimals.`
        : `${currency} amounts have at most ${exponent} decimals.`;
    }
    default:
      return "That amount is too large.";
  }
}
