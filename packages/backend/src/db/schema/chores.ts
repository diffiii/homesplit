import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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
      onDelete: "restrict",
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
    // The list order within one assignee, open or completed.
    index("chores_assignee_list_idx").on(
      table.householdId,
      table.assignedToId,
      table.isCompleted,
      table.dueAt,
      table.createdAt,
      table.id
    ),
    index("chores_addedById_idx").on(table.addedById),
    // Open chores have no completion metadata; completed chores have both.
    check(
      "chores_completion",
      sql`(${table.isCompleted} AND ${table.completedAt} IS NOT NULL AND ${table.completedById} IS NOT NULL) OR (NOT ${table.isCompleted} AND ${table.completedAt} IS NULL AND ${table.completedById} IS NULL)`
    ),
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
