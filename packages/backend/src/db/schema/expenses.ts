import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { householdMembershipHistory } from "./households";

/** A household's own expense categories; `icon` is a single emoji. */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
  },
  (table) => [
    index("expense_categories_household_id_idx").on(table.householdId),
  ]
);

/**
 * Payments made outside HomeSplit, each an independent ledger entry. A row is
 * pending while `confirmed_at` is null, and only confirmed rows count toward
 * balances.
 */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    payeeId: uuid("payee_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedById: uuid("confirmed_by_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    // Both parties have been members of this household, not just users.
    foreignKey({
      name: "settlements_payer_party_fk",
      columns: [table.householdId, table.payerId],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    foreignKey({
      name: "settlements_payee_party_fk",
      columns: [table.householdId, table.payeeId],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check(
      "settlements_distinct_parties",
      sql`${table.payerId} <> ${table.payeeId}`
    ),
    check("settlements_amount_positive", sql`${table.amountCents} > 0`),
    check("settlements_currency_code", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("settlements_note_not_empty", sql`${table.note} <> ''`),
    check(
      "settlements_confirmation",
      sql`(${table.confirmedById} IS NULL) = (${table.confirmedAt} IS NULL)`
    ),
    // Read backward for the history order: `created_at` desc, `id` desc.
    index("settlements_history_idx").on(
      table.householdId,
      table.createdAt,
      table.id
    ),
  ]
);
