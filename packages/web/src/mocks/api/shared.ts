import type { Pagination } from "@homesplit/contracts";
import type { MockDb } from "../db";
import { invalidReference, notFound } from "../errors";

type Comparator<T> = (a: T, b: T) => number;

function compareValues(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }
  return (a as string) < (b as string) ? -1 : 1;
}

/** Ascending by `key`; locale-independent, like the database's ordering of IDs and timestamps. */
export const asc =
  <T>(key: (item: T) => string | number | boolean): Comparator<T> =>
  (a, b) =>
    compareValues(key(a), key(b));

export const desc =
  <T>(key: (item: T) => string | number | boolean): Comparator<T> =>
  (a, b) =>
    compareValues(key(b), key(a));

/** Sort a copy by each comparator in turn; the last one should be the ID. */
export function sortBy<T>(
  items: readonly T[],
  ...comparators: Comparator<T>[]
) {
  return [...items].sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}

/** One page of already sorted rows, in the shape of `paginatedResponse`. */
export function paginate<T, R>(
  rows: readonly T[],
  { page, pageSize }: Pagination,
  render: (row: T) => R
) {
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize).map(render),
    page,
    pageSize,
    totalItems: rows.length,
  };
}

/** A path resource in this household, or 404 like one that doesn't exist. */
export function findInHousehold<T extends { householdId: string; id: string }>(
  rows: readonly T[],
  householdId: string,
  id: string
): T {
  const row = rows.find(
    (candidate) => candidate.id === id && candidate.householdId === householdId
  );
  if (!row) {
    throw notFound();
  }
  return row;
}

/** The fields a `PATCH` body sets; an omitted one stays unchanged. */
export function definedFields<T extends object>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function removeRow<T>(rows: T[], row: T): void {
  rows.splice(rows.indexOf(row), 1);
}

/** Answer 400 `INVALID_REFERENCE` for every user at its path who isn't a current member. */
export function assertCurrentMembers(
  db: MockDb,
  householdId: string,
  refs: readonly { path: (string | number)[]; userId: string }[]
): void {
  const issues = refs
    .filter(({ userId }) => !db.member(householdId, userId))
    .map(({ path }) => ({ path, message: "Not a current member" }));
  if (issues.length > 0) {
    throw invalidReference(issues);
  }
}
