import { alias } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

export const userSummaryColumns = {
  id: user.id,
  name: user.name,
  imageUrl: user.image,
};

/** Columns for a `FriendUser`: a `UserSummary` plus email, for friend contexts only. */
export const friendUserColumns = {
  ...userSummaryColumns,
  email: user.email,
};

/** `user` under another name, for rows that reference several users. */
export function userRole(name: string) {
  const table = alias(user, name);
  return {
    table,
    summary: { id: table.id, name: table.name, imageUrl: table.image },
  };
}
