import { randomUUID } from "node:crypto";
import {
  FriendRequest,
  Friendship,
  FriendshipListResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { friendRequests, friendships } from "@/db/schema";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createUser, type TestUser } from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

const REQUESTS = "/api/me/friend-requests";
const FRIENDS = "/api/me/friends";
const acceptPath = (requestId: string) => `${REQUESTS}/${requestId}/accept`;
const declinePath = (requestId: string) => `${REQUESTS}/${requestId}/decline`;
const friendshipPath = (friendshipId: string) => `${FRIENDS}/${friendshipId}`;

const friendUser = ({ id, name, email }: TestUser) => ({
  id,
  name,
  imageUrl: null,
  email,
});

/** The pair as `friendships` stores it, smaller ID first. */
const storedPair = (x: TestUser, y: TestUser) => {
  const [userAId, userBId] = [x.id, y.id].sort();
  return { userAId, userBId };
};

describe("friendships", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function sendRequest(
    from: TestUser,
    to: TestUser
  ): Promise<FriendRequest> {
    const response = await from.client
      .post(REQUESTS)
      .send({ email: to.email })
      .expect(201);
    return FriendRequest.parse(response.body);
  }

  async function befriend(from: TestUser, to: TestUser): Promise<Friendship> {
    const request = await sendRequest(from, to);
    const response = await to.client.post(acceptPath(request.id)).expect(200);
    return Friendship.parse(response.body);
  }

  async function listFriends(viewer: TestUser): Promise<Friendship[]> {
    const response = await viewer.client.get(FRIENDS).expect(200);
    return FriendshipListResponse.parse(response.body).items;
  }

  describe("POST /api/me/friend-requests/:requestId/accept", () => {
    it("replaces the request with one friendship", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const request = await sendRequest(alice, bob);

      const response = await bob.client
        .post(acceptPath(request.id))
        .expect(200);

      const friendship = Friendship.parse(response.body);
      expect(friendship.friend).toEqual(friendUser(alice));
      expect(await db.select().from(friendRequests)).toEqual([]);
      expect(await db.select().from(friendships)).toEqual([
        {
          id: friendship.id,
          ...storedPair(alice, bob),
          createdAt: new Date(friendship.createdAt),
        },
      ]);
    });

    it("answers 403 to the requester and 404 to anyone else", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "Carol");
      const request = await sendRequest(alice, bob);

      const byRequester = await alice.client
        .post(acceptPath(request.id))
        .expect(403);
      const byStranger = await carol.client
        .post(acceptPath(request.id))
        .expect(404);

      expectApiError(byRequester, "FORBIDDEN");
      expectApiError(byStranger, "NOT_FOUND");
      expect(await db.select().from(friendRequests)).toHaveLength(1);
      expect(await db.select().from(friendships)).toEqual([]);
    });

    it("answers 404 when repeated", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const request = await sendRequest(alice, bob);
      await bob.client.post(acceptPath(request.id)).expect(200);

      const response = await bob.client
        .post(acceptPath(request.id))
        .expect(404);

      expectApiError(response, "NOT_FOUND");
      expect(await db.select().from(friendships)).toHaveLength(1);
    });

    it("waits for a concurrent accept, then answers 404", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const request = await sendRequest(alice, bob);

      const response = await sendDuring(
        async (tx) => {
          await tx
            .delete(friendRequests)
            .where(eq(friendRequests.id, request.id));
          await tx.insert(friendships).values(storedPair(alice, bob));
        },
        () => bob.client.post(acceptPath(request.id))
      );

      expect(response.status).toBe(404);
      expect(await db.select().from(friendships)).toHaveLength(1);
    });

    it("rolls back when the users are already friends", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const request = await sendRequest(alice, bob);
      await db.insert(friendships).values(storedPair(alice, bob));

      const response = await bob.client
        .post(acceptPath(request.id))
        .expect(409);

      expectApiError(response, "ALREADY_FRIENDS");
      expect(await db.select().from(friendRequests)).toHaveLength(1);
      expect(await db.select().from(friendships)).toHaveLength(1);
    });

    it("rejects a malformed request ID", async () => {
      const bob = await createUser(app, "Bob");

      const response = await bob.client
        .post(acceptPath("not-a-uuid"))
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });
  });

  describe("POST /api/me/friend-requests/:requestId/decline", () => {
    it("deletes the request, and the requester may ask again", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const request = await sendRequest(alice, bob);

      await bob.client.post(declinePath(request.id)).expect(204);

      expect(await db.select().from(friendRequests)).toEqual([]);
      expect(await db.select().from(friendships)).toEqual([]);
      await sendRequest(alice, bob);
    });

    it("answers 403 to the requester and 404 to anyone else", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "Carol");
      const request = await sendRequest(alice, bob);

      const byRequester = await alice.client
        .post(declinePath(request.id))
        .expect(403);
      const byStranger = await carol.client
        .post(declinePath(request.id))
        .expect(404);

      expectApiError(byRequester, "FORBIDDEN");
      expectApiError(byStranger, "NOT_FOUND");
      expect(await db.select().from(friendRequests)).toHaveLength(1);
    });

    it("answers 404 once the request is declined or accepted", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "Carol");
      const declined = await sendRequest(alice, bob);
      const accepted = await sendRequest(carol, bob);
      await bob.client.post(declinePath(declined.id)).expect(204);
      await bob.client.post(acceptPath(accepted.id)).expect(200);

      await bob.client.post(declinePath(declined.id)).expect(404);
      await bob.client.post(declinePath(accepted.id)).expect(404);
      expect(await db.select().from(friendships)).toHaveLength(1);
    });
  });

  describe("GET /api/me/friends", () => {
    it("shows the other user from each side, by name ignoring case", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "carol");
      const dave = await createUser(app, "Dave");
      const eve = await createUser(app, "Eve");
      const withDave = await befriend(alice, dave);
      const withBob = await befriend(bob, alice);
      const withCarol = await befriend(alice, carol);

      expect(await listFriends(alice)).toEqual([
        { ...withBob, friend: friendUser(bob) },
        { ...withCarol, friend: friendUser(carol) },
        { ...withDave, friend: friendUser(dave) },
      ]);
      expect(await listFriends(bob)).toEqual([
        { ...withBob, friend: friendUser(alice) },
      ]);
      expect(await listFriends(eve)).toEqual([]);
    });
  });

  describe("DELETE /api/me/friends/:friendshipId", () => {
    it("lets either friend end the friendship", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const first = await befriend(alice, bob);

      await alice.client.delete(friendshipPath(first.id)).expect(204);
      expect(await listFriends(bob)).toEqual([]);

      const second = await befriend(alice, bob);
      await bob.client.delete(friendshipPath(second.id)).expect(204);
      expect(await listFriends(alice)).toEqual([]);
    });

    it("answers 404 to anyone else and when repeated", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "Carol");
      const friendship = await befriend(alice, bob);

      const byStranger = await carol.client
        .delete(friendshipPath(friendship.id))
        .expect(404);
      await alice.client.delete(friendshipPath(friendship.id)).expect(204);
      const repeated = await alice.client
        .delete(friendshipPath(friendship.id))
        .expect(404);

      expectApiError(byStranger, "NOT_FOUND");
      expectApiError(repeated, "NOT_FOUND");
    });
  });

  it.each([
    ["get", FRIENDS],
    ["delete", friendshipPath(randomUUID())],
    ["post", acceptPath(randomUUID())],
    ["post", declinePath(randomUUID())],
  ] as const)("requires a session for %s %s", async (method, path) => {
    await createClient(app)[method](path).expect(401);
  });

  describe("database constraints", () => {
    it("reject self, reversed, and duplicate pairs", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const { userAId, userBId } = storedPair(alice, bob);
      await db.insert(friendships).values({ userAId, userBId });

      await expect(
        db.insert(friendships).values({ userAId, userBId: userAId })
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        db.insert(friendships).values({ userAId: userBId, userBId: userAId })
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        db.insert(friendships).values({ userAId, userBId })
      ).rejects.toMatchObject({ cause: { code: "23505" } });
    });
  });
});
