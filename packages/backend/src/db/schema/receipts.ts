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
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { attachments } from "./attachments";
import { organization, user } from "./auth";
import { householdMembershipHistory } from "./households";

/**
 * A receipt read from an attachment, editable until it's confirmed. Header
 * fields stay null until extraction or a member fills them in. While
 * `status` is `processing`, `extraction_id` names the run allowed to write
 * the result, so a run that a retry or a discard overtook writes nothing.
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
