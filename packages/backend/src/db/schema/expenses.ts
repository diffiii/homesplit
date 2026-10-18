import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
    // Serves the list by `household_id`, and is the target of the composite
    // key that keeps an expense's category in the expense's household.
    unique("expense_categories_household_id_id_key").on(
      table.householdId,
      table.id
    ),
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

/**
 * One expense; its payers, allocation input, and calculated splits live in the
 * child tables below. Amounts are in `currency`, which every child row
 * inherits.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    totalAmountCents: bigint("total_amount_cents", {
      mode: "bigint",
    }).notNull(),
    currency: text("currency").notNull(),
    allocationMethod: text("allocation_method").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id"),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Targets for the child rows' composite keys, which keep each child in its
    // expense's household and, for participants, on its allocation method.
    unique("expenses_id_household_id_key").on(table.id, table.householdId),
    unique("expenses_id_household_id_allocation_method_key").on(
      table.id,
      table.householdId,
      table.allocationMethod
    ),
    // The category belongs to this household. A null `category_id` skips the
    // check. Deleting a category in use fails; see `CATEGORY_IN_USE`.
    foreignKey({
      name: "expenses_category_fk",
      columns: [table.householdId, table.categoryId],
      foreignColumns: [expenseCategories.householdId, expenseCategories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "expenses_author_party_fk",
      columns: [table.householdId, table.authorId],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check("expenses_name_not_empty", sql`${table.name} <> ''`),
    check("expenses_description_not_empty", sql`${table.description} <> ''`),
    check("expenses_total_amount_positive", sql`${table.totalAmountCents} > 0`),
    check("expenses_currency_code", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "expenses_allocation_method",
      sql`${table.allocationMethod} IN ('equal', 'percentage', 'shares', 'exact', 'adjustment')`
    ),
    // Read backward for the list order: `expense_date`, `created_at`, and
    // `id`, all descending.
    index("expenses_list_idx").on(
      table.householdId,
      table.expenseDate,
      table.createdAt,
      table.id
    ),
    index("expenses_category_idx").on(table.householdId, table.categoryId),
    index("expenses_currency_idx").on(table.householdId, table.currency),
  ]
);

/**
 * Columns every expense child row has. Reads order child rows by `user_id`,
 * which the primary key serves.
 *
 * `household_id` cascades from `organization` directly, not only through the
 * expense. A row reached only through the expense would still exist when the
 * household's cascade checks its key to membership history, and fail it.
 */
const expenseChildColumns = () => ({
  expenseId: uuid("expense_id").notNull(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
});

type ExpenseChildTable = Record<
  keyof ReturnType<typeof expenseChildColumns>,
  AnyPgColumn
>;

/**
 * Constraints every expense child row has: one row per user, deleted with its
 * expense, and the user has been a member of the expense's household.
 */
const expenseChildConstraints = (name: string, table: ExpenseChildTable) => [
  primaryKey({ columns: [table.expenseId, table.userId] }),
  foreignKey({
    name: `${name}_expense_fk`,
    columns: [table.expenseId, table.householdId],
    foreignColumns: [expenses.id, expenses.householdId],
  }).onDelete("cascade"),
  foreignKey({
    name: `${name}_party_fk`,
    columns: [table.householdId, table.userId],
    foreignColumns: [
      householdMembershipHistory.organizationId,
      householdMembershipHistory.userId,
    ],
  }),
];

/** Who paid how much of an expense; payer amounts sum to its total. */
export const expensePayers = pgTable(
  "expense_payers",
  {
    ...expenseChildColumns(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
  },
  (table) => [
    ...expenseChildConstraints("expense_payers", table),
    check("expense_payers_amount_positive", sql`${table.amountCents} > 0`),
    index("expense_payers_member_idx").on(table.householdId, table.userId),
  ]
);

/**
 * The allocation input as the client sent it. `value` holds the participant's
 * input for the expense's `allocation_method`: basis points, shares, an exact
 * amount, or an adjustment. `equal` has none.
 */
export const expenseAllocationParticipants = pgTable(
  "expense_allocation_participants",
  {
    ...expenseChildColumns(),
    allocationMethod: text("allocation_method").notNull(),
    value: bigint("value", { mode: "bigint" }),
  },
  (table) => [
    ...expenseChildConstraints("expense_allocation_participants", table),
    // Repeats the expense's method, so the check below can see it.
    foreignKey({
      name: "expense_allocation_participants_method_fk",
      columns: [table.expenseId, table.householdId, table.allocationMethod],
      foreignColumns: [
        expenses.id,
        expenses.householdId,
        expenses.allocationMethod,
      ],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    // A null comparison would pass a check, so a missing value counts as false.
    check(
      "expense_allocation_participants_value",
      sql`COALESCE(CASE ${table.allocationMethod}
        WHEN 'equal' THEN ${table.value} IS NULL
        WHEN 'percentage' THEN ${table.value} BETWEEN 1 AND 10000
        WHEN 'shares' THEN ${table.value} > 0
        WHEN 'exact' THEN ${table.value} >= 0
        WHEN 'adjustment' THEN ${table.value} IS NOT NULL
      END, false)`
    ),
  ]
);

/**
 * Each participant's share of an expense, calculated by the allocation engine
 * from the participants above; split amounts sum to the total.
 */
export const expenseSplits = pgTable(
  "expense_splits",
  {
    ...expenseChildColumns(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
  },
  (table) => [
    ...expenseChildConstraints("expense_splits", table),
    check("expense_splits_amount_nonnegative", sql`${table.amountCents} >= 0`),
    index("expense_splits_member_idx").on(table.householdId, table.userId),
  ]
);

// Relations for `db.query`, which reads an expense with its child rows in one
// query. They don't change the database.

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  author: one(user, { fields: [expenses.authorId], references: [user.id] }),
  category: one(expenseCategories, {
    fields: [expenses.categoryId],
    references: [expenseCategories.id],
  }),
  payers: many(expensePayers),
  participants: many(expenseAllocationParticipants),
  splits: many(expenseSplits),
}));

export const expensePayersRelations = relations(expensePayers, ({ one }) => ({
  expense: one(expenses, {
    fields: [expensePayers.expenseId],
    references: [expenses.id],
  }),
  user: one(user, { fields: [expensePayers.userId], references: [user.id] }),
}));

export const expenseAllocationParticipantsRelations = relations(
  expenseAllocationParticipants,
  ({ one }) => ({
    expense: one(expenses, {
      fields: [expenseAllocationParticipants.expenseId],
      references: [expenses.id],
    }),
  })
);

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseSplits.expenseId],
    references: [expenses.id],
  }),
  user: one(user, { fields: [expenseSplits.userId], references: [user.id] }),
}));
