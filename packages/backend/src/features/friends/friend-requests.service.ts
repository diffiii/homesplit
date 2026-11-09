import type {
  FriendRequest,
  FriendRequestListResponse,
  Friendship,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, or } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import { friendRequests, user } from "@/db/schema";
import { friendUserColumns } from "@/features/users/user-projections";
import { AppError, forbidden, notFound } from "@/http/app-error";
import { assertNotFriends, createFriendship } from "./friendships.service";

type Direction = "incoming" | "sent";

const toFriendRequest = (row: {
  id: string;
  user: FriendRequest["user"];
  createdAt: Date;
}): FriendRequest => ({ ...row, createdAt: row.createdAt.toISOString() });

@Injectable()
export class FriendRequestsService {
  async create(requesterId: string, email: string): Promise<FriendRequest> {
    const [recipient] = await db
      .select(friendUserColumns)
      .from(user)
      .where(eq(user.email, email));
    if (!recipient) {
      throw new AppError(400, "USER_NOT_FOUND", "No user has this email");
    }
    if (recipient.id === requesterId) {
      throw new AppError(
        400,
        "SELF_FRIEND_REQUEST",
        "You can't send a friend request to yourself"
      );
    }

    await assertNotFriends(db, requesterId, recipient.id);

    const [created] = await db
      .insert(friendRequests)
      .values({ requesterId, recipientId: recipient.id })
      .onConflictDoNothing()
      .returning({
        id: friendRequests.id,
        createdAt: friendRequests.createdAt,
      });
    if (!created) {
      throw await pairConflict(requesterId, recipient.id);
    }
    return toFriendRequest({ ...created, user: recipient });
  }

  listIncoming(userId: string): Promise<FriendRequestListResponse> {
    return list(userId, "incoming");
  }

  listSent(userId: string): Promise<FriendRequestListResponse> {
    return list(userId, "sent");
  }

  /** Deletes the request and creates its friendship in one transaction. */
  accept(userId: string, requestId: string): Promise<Friendship> {
    return db.transaction(async (tx) => {
      const { requesterId } = await lockAs(tx, "recipient", userId, requestId);
      await tx.delete(friendRequests).where(eq(friendRequests.id, requestId));
      return createFriendship(tx, userId, requesterId);
    });
  }

  async decline(userId: string, requestId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await lockAs(tx, "recipient", userId, requestId);
      await tx.delete(friendRequests).where(eq(friendRequests.id, requestId));
    });
  }

  async withdraw(userId: string, requestId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await lockAs(tx, "requester", userId, requestId);
      await tx.delete(friendRequests).where(eq(friendRequests.id, requestId));
    });
  }
}

/**
 * Locks a request the caller is party to, so concurrent accepts, declines, and
 * withdrawals act on it one at a time and the later ones answer 404. Only the
 * caller on `side` may act: the other party gets 403, and anyone else 404.
 */
async function lockAs(
  tx: Transaction,
  side: "requester" | "recipient",
  userId: string,
  requestId: string
) {
  const [request] = await tx
    .select({
      requesterId: friendRequests.requesterId,
      recipientId: friendRequests.recipientId,
    })
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.id, requestId),
        or(
          eq(friendRequests.requesterId, userId),
          eq(friendRequests.recipientId, userId)
        )
      )
    )
    .for("update");
  if (!request) {
    throw notFound();
  }
  if (request[`${side}Id`] !== userId) {
    throw forbidden();
  }
  return request;
}

/** Requests where `userId` is on the `direction` side, each with the other user. */
async function list(
  userId: string,
  direction: Direction
): Promise<FriendRequestListResponse> {
  const [mine, other] =
    direction === "incoming"
      ? [friendRequests.recipientId, friendRequests.requesterId]
      : [friendRequests.requesterId, friendRequests.recipientId];
  const rows = await db
    .select({
      id: friendRequests.id,
      user: friendUserColumns,
      createdAt: friendRequests.createdAt,
    })
    .from(friendRequests)
    .innerJoin(user, eq(user.id, other))
    .where(eq(mine, userId))
    .orderBy(desc(friendRequests.createdAt), desc(friendRequests.id));
  return { items: rows.map(toFriendRequest) };
}

/** Explains why the pair already has a request, in either direction. */
async function pairConflict(
  requesterId: string,
  recipientId: string
): Promise<AppError> {
  const [existing] = await db
    .select({ requesterId: friendRequests.requesterId })
    .from(friendRequests)
    .where(
      or(
        and(
          eq(friendRequests.requesterId, requesterId),
          eq(friendRequests.recipientId, recipientId)
        ),
        and(
          eq(friendRequests.requesterId, recipientId),
          eq(friendRequests.recipientId, requesterId)
        )
      )
    );
  if (!existing) {
    // The other request was accepted or declined in the meantime.
    return new AppError(409, "CONFLICT", "Conflicts with existing data");
  }
  return existing.requesterId === requesterId
    ? new AppError(
        409,
        "FRIEND_REQUEST_EXISTS",
        "You already sent this user a friend request"
      )
    : new AppError(
        409,
        "INCOMING_FRIEND_REQUEST_EXISTS",
        "This user already sent you a friend request"
      );
}
