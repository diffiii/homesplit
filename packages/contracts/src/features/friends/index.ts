import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { UserSummary } from "../users";

/** User summary with email for friend requests and friendship lists. */
export const FriendUser = UserSummary.extend({
  email: z.email(),
});
export type FriendUser = z.infer<typeof FriendUser>;

/**
 * Accepted friendship from the authenticated user's perspective.
 */
export const Friendship = z.object({
  id: Id,
  friend: FriendUser,
  createdAt: IsoDateTime,
});
export type Friendship = z.infer<typeof Friendship>;

/** Path params for friendship-scoped routes (remove). */
export const FriendshipIdParams = z.object({
  friendshipId: Id,
});
export type FriendshipIdParams = z.infer<typeof FriendshipIdParams>;

/** Unpaginated accepted-friendships list. */
export const FriendshipListResponse = z.object({
  items: z.array(Friendship),
});
export type FriendshipListResponse = z.infer<typeof FriendshipListResponse>;

/**
 * Pending friend invitation.
 * Direction comes from the endpoint (pending = incoming, sent = outgoing).
 */
export const FriendRequest = z.object({
  id: Id,
  user: FriendUser,
  createdAt: IsoDateTime,
});
export type FriendRequest = z.infer<typeof FriendRequest>;

/** Create a friend request by recipient email; requester is the authenticated user. */
export const CreateFriendRequest = z.object({
  email: z.email(),
});
export type CreateFriendRequest = z.infer<typeof CreateFriendRequest>;

/** Path params for friend-request routes (accept / decline). */
export const FriendRequestIdParams = z.object({
  requestId: Id,
});
export type FriendRequestIdParams = z.infer<typeof FriendRequestIdParams>;

/** Unpaginated friend-request list (incoming or sent). */
export const FriendRequestListResponse = z.object({
  items: z.array(FriendRequest),
});
export type FriendRequestListResponse = z.infer<
  typeof FriendRequestListResponse
>;

/** Response for accepting a friend request (request is removed, friendship created). */
export type AcceptFriendRequestResponse = Friendship;
