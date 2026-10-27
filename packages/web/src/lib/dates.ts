import type { IsoDate, IsoDateTime } from "@homesplit/contracts";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

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
