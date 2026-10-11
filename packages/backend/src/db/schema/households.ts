import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
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
