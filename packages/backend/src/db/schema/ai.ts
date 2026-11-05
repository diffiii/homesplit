import { date, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/** AI requests per household and UTC day, for the daily limit. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    requests: integer("requests").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.day] })]
);
