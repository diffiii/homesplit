import { describe, expect, it } from "vitest";

import { toSafeInteger } from "./safe-integer";

describe("toSafeInteger", () => {
  it("converts integers from strings, bigints, and numbers", () => {
    expect(toSafeInteger("1999")).toBe(1999);
    expect(toSafeInteger("-42")).toBe(-42);
    expect(toSafeInteger(7n)).toBe(7);
    expect(toSafeInteger(0)).toBe(0);
    expect(toSafeInteger(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER
    );
    expect(toSafeInteger(String(-Number.MAX_SAFE_INTEGER))).toBe(
      -Number.MAX_SAFE_INTEGER
    );
  });

  it("rejects values outside the safe range", () => {
    expect(() => toSafeInteger(String(Number.MAX_SAFE_INTEGER + 1))).toThrow(
      RangeError
    );
    expect(() => toSafeInteger(-Number.MAX_SAFE_INTEGER - 1)).toThrow(
      RangeError
    );
    expect(() => toSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError
    );
  });

  it("rejects non-integers", () => {
    expect(() => toSafeInteger("12.50")).toThrow(RangeError);
    expect(() => toSafeInteger("")).toThrow(RangeError);
    expect(() => toSafeInteger("1e3")).toThrow(RangeError);
    expect(() => toSafeInteger(1.5)).toThrow(RangeError);
    expect(() => toSafeInteger(Number.NaN)).toThrow(RangeError);
  });
});
