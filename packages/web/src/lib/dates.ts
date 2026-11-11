import type { IsoDate, IsoDateTime } from "@homesplit/contracts";

const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;
const LOCAL_DATE_TIME =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hours>\d{2}):(?<minutes>\d{2})$/u;

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

/**
 * The calendar date as a `Date` at local midnight. `new Date("2026-03-01")`
 * would read it as UTC midnight, which is still February west of Greenwich.
 */
export function parseIsoDate(date: IsoDate): Date {
  const match = ISO_DATE.exec(date);
  if (!match) {
    throw new RangeError(`Not an ISO date: ${date}`);
  }
  const [, year, month, day] = match.map(Number);
  return new Date(year, month - 1, day);
}

/** The local calendar date of `date`, as the API stores due dates and expense dates. */
export function toIsoDate(date: Date): IsoDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIsoDate(now = new Date()): IsoDate {
  return toIsoDate(now);
}

/**
 * A `datetime-local` input value (`2026-03-01T18:30`) in the user's time zone
 * as a UTC `IsoDateTime`.
 */
export function localDateTimeToIso(value: string): IsoDateTime {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) {
    throw new RangeError(`Not a local date-time: ${value}`);
  }
  const [, year, month, day, hours, minutes] = match.map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** A UTC `IsoDateTime` as a `datetime-local` input value in the user's time zone. */
export function isoToLocalDateTime(value: IsoDateTime): string {
  const date = new Date(value);
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** `Mar 1, 2026`, the same calendar date in every time zone. */
export function formatIsoDate(date: IsoDate): string {
  return dateFormat.format(parseIsoDate(date));
}

/** `Mar 1, 2026`: the date of a moment, in the user's time zone. */
export function formatLocalDate(value: Date | IsoDateTime): string {
  return dateFormat.format(new Date(value));
}

/** `Mar 1, 2026, 6:30 PM` in the user's time zone. */
export function formatIsoDateTime(value: IsoDateTime): string {
  return dateTimeFormat.format(new Date(value));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(
  value: IsoDateTime,
  now = new Date()
): string {
  const then = new Date(value);
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE_MS) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    return relativeFormat.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  }
  const days = Math.round(
    (parseIsoDate(toIsoDate(now)).getTime() -
      parseIsoDate(toIsoDate(then)).getTime()) /
      DAY_MS
  );
  if (days === 0) {
    return relativeFormat.format(-Math.floor(elapsed / HOUR_MS), "hour");
  }
  return days < 7 ? relativeFormat.format(-days, "day") : formatLocalDate(then);
}

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "short" });

/** `6:30 PM` for a `HH:MM` time of day. */
export function formatTimeOfDay(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return timeFormat.format(new Date(2000, 0, 1, hours, minutes));
}
const dayFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

/** `Today, 6:30 PM`, `Tomorrow, 9:00 AM`, or `Mar 14, 8:00 PM`, as deadlines are shown. */
export function formatDueTime(value: IsoDateTime, now = new Date()): string {
  const due = new Date(value);
  const days = Math.round(
    (parseIsoDate(toIsoDate(due)).getTime() -
      parseIsoDate(toIsoDate(now)).getTime()) /
      DAY_MS
  );
  const names: Record<number, string> = {
    [-1]: "Yesterday",
    0: "Today",
    1: "Tomorrow",
  };
  const day =
    names[days] ??
    (due.getFullYear() === now.getFullYear()
      ? dayFormat.format(due)
      : formatLocalDate(due));
  return `${day}, ${timeFormat.format(due)}`;
}
