import {
  boolean,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Everyone who has ever been a member of a household. Rows are inserted by a
 * trigger on `member` and outlive the `member` row; they never grant access.
 */
export const householdMembershipHistory = pgTable(
  "household_membership_history",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    firstJoinedAt: timestamp("first_joined_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })]
);

/** Per-household module toggles; one row per organization, seeded by trigger. */
export const householdFeatures = pgTable("household_features", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  expensesEnabled: boolean("expenses_enabled").notNull().default(true),
  choresEnabled: boolean("chores_enabled").notNull().default(true),
  shoppingEnabled: boolean("shopping_enabled").notNull().default(true),
});
