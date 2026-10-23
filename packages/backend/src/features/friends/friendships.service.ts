import type { Friendship, FriendshipListResponse } from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db, type Executor, type Transaction } from "@/db";
import { friendships, user } from "@/db/schema";
import { friendUserColumns } from "@/features/users/user-projections";
import { AppError, notFound } from "@/http/app-error";

const toFriendship = (row: {
  id: string;
  friend: Friendship["friend"];
  createdAt: Date;
}): Friendship => ({ ...row, createdAt: row.createdAt.toISOString() });

/**
 * Orders a pair the way `friendships` stores it, smaller ID first. PostgreSQL
 * prints UUIDs in lowercase, so string order matches `uuid` order.
 */
const orderedPair = (x: string, y: string) =>
  x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x };

const involves = (userId: string) =>
  or(eq(friendships.userAId, userId), eq(friendships.userBId, userId));

const alreadyFriends = (): AppError =>
  new AppError(409, "ALREADY_FRIENDS", "You're already friends with this user");

/** Friendships joined with the other user, as `viewerId` sees them. */
const selectFriendships = (executor: Executor, viewerId: string) =>
  executor
    .select({
      id: friendships.id,
      friend: friendUserColumns,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(
      user,
      eq(
        user.id,
        sql`CASE WHEN ${friendships.userAId} = ${viewerId} THEN ${friendships.userBId} ELSE ${friendships.userAId} END`
      )
    );

export async function assertNotFriends(
  executor: Executor,
  x: string,
  y: string
): Promise<void> {
  const { userAId, userBId } = orderedPair(x, y);
  const [existing] = await executor
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(eq(friendships.userAId, userAId), eq(friendships.userBId, userBId))
    );
  if (existing) {
    throw alreadyFriends();
  }
}

/**
 * Creates the friendship of `viewerId` and `otherId`, as `viewerId` sees it.
 * If it already exists, the 409 rolls back the caller's transaction.
 */
export async function createFriendship(
  tx: Transaction,
  viewerId: string,
  otherId: string
): Promise<Friendship> {
  const [created] = await tx
    .insert(friendships)
    .values(orderedPair(viewerId, otherId))
    .onConflictDoNothing()
    .returning({ id: friendships.id });
  if (!created) {
    throw alreadyFriends();
  }
  const [friendship] = await selectFriendships(tx, viewerId).where(
    eq(friendships.id, created.id)
  );
  return toFriendship(friendship);
}

@Injectable()
export class FriendshipsService {
  async list(userId: string): Promise<FriendshipListResponse> {
    const rows = await selectFriendships(db, userId)
      .where(involves(userId))
      .orderBy(asc(sql`lower(${user.name})`), asc(friendships.id));
    return { items: rows.map(toFriendship) };
  }

  async remove(userId: string, friendshipId: string): Promise<void> {
    const deleted = await db
      .delete(friendships)
      .where(and(eq(friendships.id, friendshipId), involves(userId)))
      .returning({ id: friendships.id });
    if (deleted.length === 0) {
      throw notFound();
    }
  }
}
