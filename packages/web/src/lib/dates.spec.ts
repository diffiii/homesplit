import { describe, expect, it } from "vitest";
import {
  formatIsoDate,
  formatIsoDateTime,
  formatLocalDate,
  formatRelativeTime,
  isoToLocalDateTime,
  localDateTimeToIso,
  parseIsoDate,
  todayIsoDate,
  toIsoDate,
} from "./dates";

// ICU versions differ on the space before PM.
const EVENING = /^Mar 1, 2026, 6:30\sPM$/u;

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

  it("formats a moment's local date", () => {
    // Still March 1 in New York.
    expect(formatLocalDate("2026-03-02T03:30:00Z")).toBe("Mar 1, 2026");
    expect(formatLocalDate(new Date("2026-03-02T03:30:00Z"))).toBe(
      "Mar 1, 2026"
    );
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 2, 10, 12, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("counts minutes and hours today, then calendar days", () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe("5 minutes ago");
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(
      formatRelativeTime(new Date(2026, 2, 9, 23, 0).toISOString(), now)
    ).toBe("yesterday");
    expect(
      formatRelativeTime(new Date(2026, 2, 6, 9, 0).toISOString(), now)
    ).toBe("4 days ago");
  });

  it("gives the date from a week back", () => {
    expect(
      formatRelativeTime(new Date(2026, 2, 3, 12, 0).toISOString(), now)
    ).toBe("Mar 3, 2026");
  });
});
