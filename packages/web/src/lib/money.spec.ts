import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  decimalString,
  formatMoney,
  orderCurrencies,
  parseAmount,
  parseDecimal,
  supportedCurrencies,
  toDecimalString,
} from "./money";

describe("currencyExponent", () => {
  it("uses ISO 4217 minor units, not CLDR's display digits", () => {
    expect(currencyExponent("PLN")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
    // CLDR shows these without decimals; ISO 4217 has them.
    expect(currencyExponent("HUF")).toBe(2);
    expect(currencyExponent("IQD")).toBe(3);
  });
});

describe("parseAmount", () => {
  it("reads either decimal separator into minor units", () => {
    expect(parseAmount("19.99", "PLN")).toEqual({ ok: true, cents: 1999 });
    expect(parseAmount("19,9", "PLN")).toEqual({ ok: true, cents: 1990 });
    expect(parseAmount(" 1 234,5 ", "PLN")).toEqual({
      ok: true,
      cents: 123_450,
    });
    expect(parseAmount(".5", "PLN")).toEqual({ ok: true, cents: 50 });
    expect(parseAmount("7.", "PLN")).toEqual({ ok: true, cents: 700 });
  });

  it("follows the currency's exponent", () => {
    expect(parseAmount("1999", "JPY")).toEqual({ ok: true, cents: 1999 });
    expect(parseAmount("1.999", "KWD")).toEqual({ ok: true, cents: 1999 });
    expect(parseAmount("1.5", "JPY")).toEqual({
      ok: false,
      reason: "too-precise",
    });
  });

  it("is exact where floating point isn't", () => {
    // 0.29 * 100 is 28.999999999999996 in floating point.
    expect(parseAmount("0.29", "PLN")).toEqual({ ok: true, cents: 29 });
    expect(parseAmount("90071992547409.91", "PLN")).toEqual({
      ok: true,
      cents: 9_007_199_254_740_991,
    });
    expect(parseAmount("90071992547409.92", "PLN")).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("rejects what isn't a plain amount", () => {
    expect(parseAmount("  ", "PLN")).toEqual({ ok: false, reason: "empty" });
    for (const input of [".", "1.2.3", "1,000.00", "1e3", "abc", "-"]) {
      expect(parseAmount(input, "PLN")).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(parseAmount("1,000", "PLN")).toEqual({
      ok: false,
      reason: "too-precise",
    });
  });

  it("accepts a sign only when asked to", () => {
    expect(parseAmount("-5", "PLN")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount("+5", "PLN")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmount("-5", "PLN", { allowNegative: true })).toEqual({
      ok: true,
      cents: -500,
    });
    expect(parseAmount("+5", "PLN", { allowNegative: true })).toEqual({
      ok: true,
      cents: 500,
    });
    expect(parseAmount("-0", "PLN", { allowNegative: true })).toEqual({
      ok: true,
      cents: 0,
    });
  });
});

describe("parseDecimal", () => {
  it("reads a percentage as basis points", () => {
    expect(parseDecimal("12.5", 2)).toEqual({ ok: true, cents: 1250 });
    expect(parseDecimal("100", 2)).toEqual({ ok: true, cents: 10_000 });
    expect(parseDecimal("33.333", 2)).toEqual({
      ok: false,
      reason: "too-precise",
    });
  });
});

describe("decimalString", () => {
  it("places the decimal point by exponent", () => {
    expect(decimalString(1250, 2)).toBe("12.50");
    expect(decimalString(-7, 3)).toBe("-0.007");
    expect(decimalString(42, 0)).toBe("42");
  });
});

describe("toDecimalString", () => {
  it("places the decimal point by exponent", () => {
    expect(toDecimalString(1999, "PLN")).toBe("19.99");
    expect(toDecimalString(5, "PLN")).toBe("0.05");
    expect(toDecimalString(-120, "PLN")).toBe("-1.20");
    expect(toDecimalString(1999, "JPY")).toBe("1999");
    expect(toDecimalString(7, "KWD")).toBe("0.007");
  });

  it("round-trips with parseAmount", () => {
    for (const cents of [0, 1, 99, 100, 123_456, Number.MAX_SAFE_INTEGER]) {
      expect(parseAmount(toDecimalString(cents, "PLN"), "PLN")).toEqual({
        ok: true,
        cents,
      });
    }
  });
});

describe("formatMoney", () => {
  it("formats with the code and the ISO 4217 exponent", () => {
    expect(formatMoney({ amountCents: 123_450, currency: "PLN" })).toBe(
      "PLN\u00A01,234.50"
    );
    expect(formatMoney({ amountCents: 1999, currency: "JPY" })).toBe(
      "JPY\u00A01,999"
    );
    expect(formatMoney({ amountCents: 150_000, currency: "HUF" })).toBe(
      "HUF\u00A01,500.00"
    );
  });

  it("stays exact beyond a double's precision", () => {
    expect(
      formatMoney({ amountCents: Number.MAX_SAFE_INTEGER, currency: "PLN" })
    ).toBe("PLN\u00A090,071,992,547,409.91");
  });

  it("can sign balances", () => {
    const options = { signDisplay: "exceptZero" } as const;
    expect(formatMoney({ amountCents: 1200, currency: "EUR" }, options)).toBe(
      "+EUR\u00A012.00"
    );
    expect(formatMoney({ amountCents: -1200, currency: "EUR" }, options)).toBe(
      "-EUR\u00A012.00"
    );
    expect(formatMoney({ amountCents: 0, currency: "EUR" }, options)).toBe(
      "EUR\u00A00.00"
    );
  });
});

describe("supportedCurrencies", () => {
  it("drops codes the contracts reject", () => {
    expect(supportedCurrencies(["EUR", "XAU", "CHE", "PLN"])).toEqual([
      "EUR",
      "PLN",
    ]);
  });

  it("offers PLN from the runtime's list", () => {
    expect(supportedCurrencies()).toContain("PLN");
  });
});

describe("orderCurrencies", () => {
  it("puts recent codes, then PLN, before the rest", () => {
    expect(
      orderCurrencies(["CHF", "EUR", "GBP", "PLN", "USD"], ["USD", "EUR"])
    ).toEqual(["USD", "EUR", "PLN", "CHF", "GBP"]);
  });

  it("keeps PLN first without recent codes and drops unknown ones", () => {
    expect(orderCurrencies(["EUR", "PLN"], ["XAU"])).toEqual(["PLN", "EUR"]);
  });
});
