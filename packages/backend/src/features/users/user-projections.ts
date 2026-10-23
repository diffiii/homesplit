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
