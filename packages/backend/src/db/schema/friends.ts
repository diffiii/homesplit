import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Pending friend requests. Accepting or declining deletes the row. A pair of
 * users has at most one request, whichever direction it goes.
 */
export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "friend_requests_not_self",
      sql`${table.requesterId} <> ${table.recipientId}`
    ),
    uniqueIndex("friend_requests_pair_key").on(
      sql`least(${table.requesterId}, ${table.recipientId})`,
      sql`greatest(${table.requesterId}, ${table.recipientId})`
    ),
    index("friend_requests_requester_id_idx").on(table.requesterId),
    index("friend_requests_recipient_id_idx").on(table.recipientId),
  ]
);
