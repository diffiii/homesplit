import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  unique,
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

/**
 * Accepted friendships, one row per pair. `user_a_id` holds the smaller ID, so
 * a reversed pair can't be stored and the pair key is a plain unique key.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("friendships_ordered_pair", sql`${table.userAId} < ${table.userBId}`),
    unique("friendships_pair_key").on(table.userAId, table.userBId),
    index("friendships_user_b_id_idx").on(table.userBId),
  ]
);
