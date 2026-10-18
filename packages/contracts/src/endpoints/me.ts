import { UserBalanceListResponse } from "../features/expenses";
import {
  CreateFriendRequest,
  FriendRequest,
  FriendRequestIdParams,
  FriendRequestListResponse,
  Friendship,
  FriendshipIdParams,
  FriendshipListResponse,
} from "../features/friends";
import { UpdateProfileRequest, UserSummary } from "../features/users";
import type { Endpoint } from "./endpoint";
import { ME } from "./paths";

const FRIEND_REQUESTS = `${ME}/friend-requests`;
const FRIEND_REQUEST = `${FRIEND_REQUESTS}/:requestId`;

export const meEndpoints = {
  updateProfile: {
    method: "PATCH",
    path: ME,
    body: UpdateProfileRequest,
    status: 200,
    response: UserSummary,
  },
  listMyBalances: {
    method: "GET",
    path: `${ME}/balances`,
    status: 200,
    response: UserBalanceListResponse,
  },
  listFriendships: {
    method: "GET",
    path: `${ME}/friends`,
    status: 200,
    response: FriendshipListResponse,
  },
  removeFriendship: {
    method: "DELETE",
    path: `${ME}/friends/:friendshipId`,
    params: FriendshipIdParams,
    status: 204,
    response: null,
  },
  createFriendRequest: {
    method: "POST",
    path: FRIEND_REQUESTS,
    body: CreateFriendRequest,
    status: 201,
    response: FriendRequest,
  },
  listIncomingFriendRequests: {
    method: "GET",
    path: `${FRIEND_REQUESTS}/incoming`,
    status: 200,
    response: FriendRequestListResponse,
  },
  listSentFriendRequests: {
    method: "GET",
    path: `${FRIEND_REQUESTS}/sent`,
    status: 200,
    response: FriendRequestListResponse,
  },
  acceptFriendRequest: {
    method: "POST",
    path: `${FRIEND_REQUEST}/accept`,
    params: FriendRequestIdParams,
    status: 200,
    response: Friendship,
  },
  declineFriendRequest: {
    method: "POST",
    path: `${FRIEND_REQUEST}/decline`,
    params: FriendRequestIdParams,
    status: 204,
    response: null,
  },
} as const satisfies Record<string, Endpoint>;
