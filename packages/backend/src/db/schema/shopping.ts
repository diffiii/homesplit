import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { householdMembershipHistory } from "./households";

/** An item is purchased while `purchased_at` is set; there's no flag column. */
export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    addedById: uuid("added_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    purchasedById: uuid("purchased_by_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "shopping_items_added_by_party_fk",
      columns: [table.householdId, table.addedById],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    foreignKey({
      name: "shopping_items_purchased_by_party_fk",
      columns: [table.householdId, table.purchasedById],
      foreignColumns: [
        householdMembershipHistory.organizationId,
        householdMembershipHistory.userId,
      ],
    }),
    check("shopping_items_name_not_blank", sql`${table.name} ~ '\\S'`),
    check("shopping_items_unit_not_blank", sql`${table.unit} ~ '\\S'`),
    check("shopping_items_quantity_positive", sql`${table.quantity} >= 1`),
    check(
      "shopping_items_purchase",
      sql`(${table.purchasedById} IS NULL) = (${table.purchasedAt} IS NULL)`
    ),
    index("shopping_items_list_idx").on(
      table.householdId,
      table.addedAt,
      table.id
    ),
  ]
);
