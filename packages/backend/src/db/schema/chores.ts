import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const chores = pgTable(
  "chores",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    assignedToId: uuid("assigned_to_id").references(() => user.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }),
    addedById: uuid("added_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    isCompleted: boolean("is_completed").default(false).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    completedById: uuid("completed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .$onUpdate(() => new Date().toISOString())
      .notNull(),
  },
  (table) => [
    index("chores_householdId_idx").on(table.householdId),
    index("chores_assignedToId_idx").on(table.assignedToId),
    index("chores_addedById_idx").on(table.addedById),
  ]
);

export const choresRelations = relations(chores, ({ one }) => ({
  household: one(organization, {
    fields: [chores.householdId],
    references: [organization.id],
  }),
  addedBy: one(user, {
    fields: [chores.addedById],
    references: [user.id],
  }),
  assignedTo: one(user, {
    fields: [chores.assignedToId],
    references: [user.id],
  }),
  completedBy: one(user, {
    fields: [chores.completedById],
    references: [user.id],
  }),
}));
