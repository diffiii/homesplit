import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth";

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
