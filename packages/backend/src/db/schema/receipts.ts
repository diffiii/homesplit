import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { attachments } from "./attachments";
import { organization, user } from "./auth";
import { expenses } from "./expenses";
import { householdMembershipHistory } from "./households";

/**
 * A receipt read from an attachment, editable until it's confirmed. Header
 * fields stay null until extraction or a member fills them in. While
 * `status` is `processing`, `extraction_id` names the run allowed to write
 * the result, so a run that a retry or a discard overtook writes nothing.
 * `expense_id` is the expense a confirmed receipt became; editing that
 * expense's amounts unlinks it, and the receipt stays `confirmed`.
 */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id").notNull(),
    status: text("status").notNull(),
    failureCode: text("failure_code"),
    extractionId: uuid("extraction_id"),
    merchant: text("merchant"),
    purchasedOn: date("purchased_on", { mode: "string" }),
    currency: text("currency"),
    totalCents: bigint("total_cents", { mode: "bigint" }),
    discountCents: bigint("discount_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    // Deleting the expense puts the receipt back to `ready` first; `SET NULL`
    // only covers a household's deletion, which cascades to both.
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    // Who paid, and when the receipt was confirmed: what marking shopping
    // items purchased uses, even after the expense is edited or unlinked.
    payerId: uuid("payer_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The file is in the receipt's household. Cleanup deletes only files
    // nothing references, so this cascade runs only when the household goes.
    foreignKey({
      name: "receipts_attachment_fk",
      columns: [table.attachmentId, table.householdId],
      foreignColumns: [attachments.id, attachments.householdId],
    }).onDelete("cascade"),
    foreignKey({
      name: "receipts_created_by_party_fk",
      columns: [table.householdId, table.createdById],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check(
      "receipts_status",
      sql`${table.status} IN ('processing', 'ready', 'failed', 'confirmed')`
    ),
    check(
      "receipts_failure",
      sql`(${table.status} = 'failed') = (${table.failureCode} IS NOT NULL)`
    ),
    check(
      "receipts_extraction",
      sql`(${table.status} = 'processing') = (${table.extractionId} IS NOT NULL)`
    ),
    check("receipts_merchant_not_blank", sql`${table.merchant} ~ '\\S'`),
    check("receipts_currency_code", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("receipts_total_nonnegative", sql`${table.totalCents} >= 0`),
    check("receipts_discount_nonnegative", sql`${table.discountCents} >= 0`),
    foreignKey({
      name: "receipts_payer_party_fk",
      columns: [table.householdId, table.payerId],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check(
      "receipts_confirmation",
      sql`(${table.status} = 'confirmed') = (${table.confirmedAt} IS NOT NULL) AND (${table.confirmedAt} IS NULL) = (${table.payerId} IS NULL)`
    ),
    check(
      "receipts_expense",
      sql`${table.expenseId} IS NULL OR ${table.status} = 'confirmed'`
    ),
    // One receipt per expense; also serves the lookup from the expense.
    unique("receipts_expense_id_key").on(table.expenseId),
    // Read backward for the list order: `created_at` desc, `id` desc.
    index("receipts_list_idx").on(table.householdId, table.createdAt, table.id),
    // Serves cleanup's check for receipts of a file, and the cascade above.
    index("receipts_attachment_idx").on(table.attachmentId),
  ]
);

/**
 * A receipt's lines, read in `position` order. Positions aren't unique, so
 * an edit can renumber them in any order; every edit writes them as 0, 1, 2…
 */
export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "bigint" }).notNull(),
    discountCents: bigint("discount_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalCents: bigint("total_cents", { mode: "bigint" }).notNull(),
  },
  (table) => [
    check("receipt_items_name_not_blank", sql`${table.name} ~ '\\S'`),
    check("receipt_items_position_nonnegative", sql`${table.position} >= 0`),
    check("receipt_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "receipt_items_discount_nonnegative",
      sql`${table.discountCents} >= 0`
    ),
    index("receipt_items_receipt_idx").on(table.receiptId, table.position),
  ]
);

/**
 * Who has which receipt item, as shares of it. The household's membership
 * history key keeps every assignee a party of the household, as for expense
 * participants; the service checks they're current members. Rows go with
 * their item.
 */
export const receiptItemAssignments = pgTable(
  "receipt_item_assignments",
  {
    receiptItemId: uuid("receipt_item_id")
      .notNull()
      .references(() => receiptItems.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    shares: integer("shares").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.receiptItemId, table.userId] }),
    foreignKey({
      name: "receipt_item_assignments_party_fk",
      columns: [table.householdId, table.userId],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check("receipt_item_assignments_shares_positive", sql`${table.shares} > 0`),
    // Serves the party key above.
    index("receipt_item_assignments_party_idx").on(
      table.householdId,
      table.userId
    ),
  ]
);
