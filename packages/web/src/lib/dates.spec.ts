import { describe, expect, it } from "vitest";
import {
  formatIsoDate,
  formatIsoDateTime,
  isoToLocalDateTime,
  localDateTimeToIso,
  parseIsoDate,
  todayIsoDate,
  toIsoDate,
} from "./dates";

// ICU versions differ on the space before PM.
const EVENING = /^Mar 1, 2026, 6:30\sPM$/;

// vitest.config.mts runs these in America/New_York, west of UTC and with DST.

describe("IsoDate", () => {
  it("is a local calendar date, not UTC midnight", () => {
    const date = parseIsoDate("2026-03-01");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 2, 1,
    ]);
    expect(date.getHours()).toBe(0);
    expect(formatIsoDate("2026-03-01")).toBe("Mar 1, 2026");
  });

  it("round-trips", () => {
    for (const date of [
      "2026-01-01",
      "2026-03-08",
      "2026-11-01",
      "0999-12-31",
    ]) {
      expect(toIsoDate(parseIsoDate(date))).toBe(date);
    }
  });

  it("takes today from the local clock", () => {
    // 01:30 UTC on March 2 is still March 1 in New York.
    expect(todayIsoDate(new Date("2026-03-02T01:30:00Z"))).toBe("2026-03-01");
  });

  it("rejects other shapes", () => {
    expect(() => parseIsoDate("2026-3-1")).toThrow(RangeError);
  });
});

describe("IsoDateTime", () => {
  it("converts local date-times to UTC and back", () => {
    expect(localDateTimeToIso("2026-03-01T18:30")).toBe(
      "2026-03-01T23:30:00.000Z"
    );
    // Daylight saving time started on March 8.
    expect(localDateTimeToIso("2026-03-09T18:30")).toBe(
      "2026-03-09T22:30:00.000Z"
    );
    expect(isoToLocalDateTime("2026-03-01T23:30:00Z")).toBe("2026-03-01T18:30");
  });

  it("formats in the user's time zone", () => {
    expect(formatIsoDateTime("2026-03-01T23:30:00Z")).toMatch(EVENING);
  });
});
