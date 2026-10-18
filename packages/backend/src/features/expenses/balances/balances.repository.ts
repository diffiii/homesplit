import { and, desc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, QueryBuilder } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
import {
  expensePayers,
  expenseSplits,
  expenses,
  member,
  organization,
  settlements,
  user,
} from "@/db/schema";

const qb = new QueryBuilder();

/** Picks ledger rows by the columns that hold their household and user. */
type LedgerFilter = (
  householdId: AnyPgColumn,
  userId: AnyPgColumn
) => SQL | undefined;

/**
 * Every ledger row that `filter` keeps, signed so that a balance is the sum of
 * its user's rows: + paid, − share, + payment sent, − payment received. Only
 * confirmed payments count.
 *
 * Each table is its own branch, joined only to its expense for the currency,
 * so payer rows never multiply split rows. `filter` goes into every branch,
 * so each one reads only its own index range.
 */
function ledger(filter: LedgerFilter) {
  const paid = qb
    .select({
      householdId: expensePayers.householdId,
      currency: expenses.currency,
      userId: expensePayers.userId,
      amountCents: sql<string>`${expensePayers.amountCents}`.as("amount_cents"),
    })
    .from(expensePayers)
    .innerJoin(expenses, eq(expenses.id, expensePayers.expenseId))
    .where(filter(expensePayers.householdId, expensePayers.userId));

  const shares = qb
    .select({
      householdId: expenseSplits.householdId,
      currency: expenses.currency,
      userId: expenseSplits.userId,
      amountCents: sql<string>`-${expenseSplits.amountCents}`.as(
        "amount_cents"
      ),
    })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenses.id, expenseSplits.expenseId))
    .where(filter(expenseSplits.householdId, expenseSplits.userId));

  const sent = qb
    .select({
      householdId: settlements.householdId,
      currency: settlements.currency,
      userId: sql<string>`${settlements.payerId}`.as("user_id"),
      amountCents: sql<string>`${settlements.amountCents}`.as("amount_cents"),
    })
    .from(settlements)
    .where(
      and(
        isNotNull(settlements.confirmedAt),
        filter(settlements.householdId, settlements.payerId)
      )
    );

  const received = qb
    .select({
      householdId: settlements.householdId,
      currency: settlements.currency,
      userId: sql<string>`${settlements.payeeId}`.as("user_id"),
      amountCents: sql<string>`-${settlements.amountCents}`.as("amount_cents"),
    })
    .from(settlements)
    .where(
      and(
        isNotNull(settlements.confirmedAt),
        filter(settlements.householdId, settlements.payeeId)
      )
    );

  return paid.unionAll(shares).unionAll(sent).unionAll(received).as("ledger");
}

const sumOf = (amountCents: SQL.Aliased<string>) =>
  sql<string>`sum(${amountCents})`.as("amount_cents");

const isNonZero = (amountCents: SQL.Aliased<string>) =>
  sql`${amountCents} <> 0`;

/**
 * Every non-zero balance in the household, by currency and user. Summed
 * before users are joined, so each user is looked up once.
 */
export function householdBalances(executor: Executor, householdId: string) {
  const rows = ledger((household) => eq(household, householdId));
  const sums = qb
    .select({
      currency: rows.currency,
      userId: rows.userId,
      amountCents: sumOf(rows.amountCents),
    })
    .from(rows)
    .groupBy(rows.currency, rows.userId)
    .as("sums");

  return executor
    .select({
      currency: sums.currency,
      user: { id: user.id, name: user.name, imageUrl: user.image },
      amountCents: sums.amountCents,
    })
    .from(sums)
    .innerJoin(user, eq(user.id, sums.userId))
    .where(isNonZero(sums.amountCents))
    .orderBy(sums.currency);
}

/**
 * Every non-zero balance of the user, by currency and household, in the
 * households they're a current member of; largest first, then household ID.
 */
export function userBalances(executor: Executor, userId: string) {
  const memberships = qb
    .select({ householdId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  const rows = ledger((household, party) =>
    and(eq(party, userId), inArray(household, memberships))
  );
  const sums = qb
    .select({
      currency: rows.currency,
      householdId: rows.householdId,
      amountCents: sumOf(rows.amountCents),
    })
    .from(rows)
    .groupBy(rows.currency, rows.householdId)
    .as("sums");

  return executor
    .select({
      currency: sums.currency,
      household: { id: organization.id, name: organization.name },
      amountCents: sums.amountCents,
    })
    .from(sums)
    .innerJoin(organization, eq(organization.id, sums.householdId))
    .where(isNonZero(sums.amountCents))
    .orderBy(sums.currency, desc(sums.amountCents), organization.id);
}

/** The household's current members, as `UserSummary`s. */
export function currentMembers(executor: Executor, householdId: string) {
  return executor
    .select({ id: user.id, name: user.name, imageUrl: user.image })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, householdId));
}
