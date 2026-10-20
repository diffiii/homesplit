import type {
  FriendRequest,
  Friendship,
  FriendUser,
} from "@homesplit/contracts";
import {
  type MockDb,
  type MockFriendRequest,
  type MockFriendship,
  now,
} from "../db";
import { badRequest, conflict, notFound } from "../errors";
import type { MockRoutes } from "../routes";
import { listMyBalances } from "./ledger";
import { asc, desc, removeRow, sortBy } from "./shared";

function friendUser(db: MockDb, userId: string): FriendUser {
  return { ...db.summary(userId), email: db.user(userId).email };
}

function renderFriendship(
  db: MockDb,
  friendship: MockFriendship,
  viewerId: string
): Friendship {
  const friendId = friendship.userIds.find((id) => id !== viewerId) ?? viewerId;
  return {
    id: friendship.id,
    friend: friendUser(db, friendId),
    createdAt: friendship.createdAt,
  };
}

/** Requests from the viewer's side: `user` is the other person. */
function listRequests(
  db: MockDb,
  matches: (request: MockFriendRequest) => boolean,
  otherUser: (request: MockFriendRequest) => string
): { items: FriendRequest[] } {
  return {
    items: sortBy(
      db.state.friendRequests.filter(matches),
      desc((request) => request.createdAt),
      desc((request) => request.id)
    ).map((request) => ({
      id: request.id,
      user: friendUser(db, otherUser(request)),
      createdAt: request.createdAt,
    })),
  };
}

const areFriends = (db: MockDb, a: string, b: string) =>
  db.state.friendships.some(
    ({ userIds }) => userIds.includes(a) && userIds.includes(b)
  );

/** An incoming request to the session user; anyone else's answers 404. */
function incomingRequest(db: MockDb, requestId: string, userId: string) {
  const request = db.state.friendRequests.find(
    ({ id, toId }) => id === requestId && toId === userId
  );
  if (!request) {
    throw notFound();
  }
  return request;
}

/**
 * The backend hasn't decided the codes for self, duplicate, and crossed
 * requests yet (#31), so these are placeholders.
 */
export const meRoutes: MockRoutes = {
  updateProfile: {
    resolve: ({ db, userId, body }) => {
      const user = db.user(userId);
      if (body.name !== undefined) {
        user.name = body.name;
      }
      if (body.imageUrl !== undefined) {
        user.image = body.imageUrl;
      }
      return db.summary(userId);
    },
  },

  listMyBalances: {
    resolve: ({ db, userId }) => listMyBalances(db, userId),
  },

  listFriendships: {
    resolve: ({ db, userId }) => ({
      items: sortBy(
        db.state.friendships
          .filter(({ userIds }) => userIds.includes(userId))
          .map((friendship) => renderFriendship(db, friendship, userId)),
        asc((friendship) => friendship.friend.name.toLowerCase()),
        asc((friendship) => friendship.id)
      ),
    }),
  },

  removeFriendship: {
    resolve: ({ db, userId, params }) => {
      const friendship = db.state.friendships.find(
        ({ id, userIds }) =>
          id === params.friendshipId && userIds.includes(userId)
      );
      if (!friendship) {
        throw notFound();
      }
      removeRow(db.state.friendships, friendship);
    },
  },

  createFriendRequest: {
    resolve: ({ db, userId, body }) => {
      const recipient = db.userByEmail(body.email.trim());
      if (!recipient) {
        throw badRequest("USER_NOT_FOUND", "No user with this email");
      }
      if (recipient.id === userId) {
        throw badRequest("CANNOT_FRIEND_YOURSELF", "That's your own email");
      }
      if (areFriends(db, userId, recipient.id)) {
        throw conflict("ALREADY_FRIENDS", "You're friends already");
      }
      if (
        db.state.friendRequests.some(
          ({ fromId, toId }) =>
            (fromId === userId && toId === recipient.id) ||
            (fromId === recipient.id && toId === userId)
        )
      ) {
        throw conflict("FRIEND_REQUEST_EXISTS", "A request is already pending");
      }
      const request: MockFriendRequest = {
        id: crypto.randomUUID(),
        fromId: userId,
        toId: recipient.id,
        createdAt: now(),
      };
      db.state.friendRequests.push(request);
      return {
        id: request.id,
        user: friendUser(db, recipient.id),
        createdAt: request.createdAt,
      };
    },
  },

  listIncomingFriendRequests: {
    resolve: ({ db, userId }) =>
      listRequests(
        db,
        ({ toId }) => toId === userId,
        ({ fromId }) => fromId
      ),
  },

  listSentFriendRequests: {
    resolve: ({ db, userId }) =>
      listRequests(
        db,
        ({ fromId }) => fromId === userId,
        ({ toId }) => toId
      ),
  },

  // Not idempotent: answering deletes the request, so a repeat answers 404.
  acceptFriendRequest: {
    resolve: ({ db, userId, params }) => {
      const request = incomingRequest(db, params.requestId, userId);
      removeRow(db.state.friendRequests, request);
      const friendship: MockFriendship = {
        id: crypto.randomUUID(),
        userIds: [request.fromId, request.toId],
        createdAt: now(),
      };
      db.state.friendships.push(friendship);
      return renderFriendship(db, friendship, userId);
    },
  },

  declineFriendRequest: {
    resolve: ({ db, userId, params }) => {
      removeRow(
        db.state.friendRequests,
        incomingRequest(db, params.requestId, userId)
      );
    },
  },
};
