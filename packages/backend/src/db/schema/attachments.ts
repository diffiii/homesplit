import { relations, sql } from "drizzle-orm";
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

/**
 * Files stored for a household. The object lives in object storage under
 * `storage_key`, which the server generates; the file's own name is never
 * stored.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The uploader has been a member of this household, not just a user.
    foreignKey({
      name: "attachments_uploader_party_fk",
      columns: [table.householdId, table.uploadedById],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check("attachments_size_positive", sql`${table.sizeBytes} > 0`),
    // Serves lookups by household, and the cleanup by age.
    index("attachments_household_idx").on(table.householdId),
    index("attachments_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Objects whose `attachments` row is gone and that still have to be deleted
 * from object storage. An `AFTER DELETE ON attachments` trigger fills it, so
 * cascades from a deleted household are queued too.
 */
export const storageObjectDeletions = pgTable("storage_object_deletions", {
  storageKey: text("storage_key").primaryKey(),
  queuedAt: timestamp("queued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  household: one(organization, {
    fields: [attachments.householdId],
    references: [organization.id],
  }),
  uploadedBy: one(user, {
    fields: [attachments.uploadedById],
    references: [user.id],
  }),
}));
