import { randomUUID } from "node:crypto";
import { FriendRequest, FriendRequestListResponse } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { friendRequests } from "@/db/schema";
import { FRIEND_REQUEST_LIMIT } from "@/features/friends/friends.module";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createUser, type TestUser } from "./helpers/fixtures";

const REQUESTS = "/api/me/friend-requests";
const INCOMING = `${REQUESTS}/incoming`;
const SENT = `${REQUESTS}/sent`;

const unknownEmail = () => `nobody-${randomUUID()}@test.local`;

const friendUser = ({ id, name, email }: TestUser) => ({
  id,
  name,
  imageUrl: null,
  email,
});

describe("friend requests", () => {
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

  async function listRequests(
    viewer: TestUser,
    path: string
  ): Promise<FriendRequest[]> {
    const response = await viewer.client.get(path).expect(200);
    return FriendRequestListResponse.parse(response.body).items;
  }

  describe("POST /api/me/friend-requests", () => {
    it("creates a request from the session user to the recipient", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");

      const request = await sendRequest(alice, bob);

      expect(request.user).toEqual(friendUser(bob));
      expect(await db.select().from(friendRequests)).toEqual([
        {
          id: request.id,
          requesterId: alice.id,
          recipientId: bob.id,
          createdAt: new Date(request.createdAt),
        },
      ]);
    });

    it("trims and lowercases the email", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");

      const response = await alice.client
        .post(REQUESTS)
        .send({ email: `  ${bob.email.toUpperCase()} ` })
        .expect(201);

      expect(FriendRequest.parse(response.body).user.id).toBe(bob.id);
    });

    it.each([
      ["a malformed email", { email: "not-an-email" }],
      ["a missing email", {}],
    ])("rejects %s", async (_label, body) => {
      const alice = await createUser(app, "Alice");

      const response = await alice.client.post(REQUESTS).send(body).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });

    it("rejects an unknown email without creating a request", async () => {
      const alice = await createUser(app, "Alice");

      const response = await alice.client
        .post(REQUESTS)
        .send({ email: unknownEmail() })
        .expect(400);

      expectApiError(response, "USER_NOT_FOUND");
      expect(await db.select().from(friendRequests)).toEqual([]);
    });

    it("rejects a request to yourself", async () => {
      const alice = await createUser(app, "Alice");

      const response = await alice.client
        .post(REQUESTS)
        .send({ email: alice.email })
        .expect(400);

      expectApiError(response, "SELF_FRIEND_REQUEST");
    });

    it("rejects a duplicate request", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      await sendRequest(alice, bob);

      const response = await alice.client
        .post(REQUESTS)
        .send({ email: bob.email })
        .expect(409);

      expectApiError(response, "FRIEND_REQUEST_EXISTS");
      expect(await db.select().from(friendRequests)).toHaveLength(1);
    });

    it("rejects a crossed request while one is pending", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      await sendRequest(alice, bob);

      const response = await bob.client
        .post(REQUESTS)
        .send({ email: alice.email })
        .expect(409);

      expectApiError(response, "INCOMING_FRIEND_REQUEST_EXISTS");
      expect(await db.select().from(friendRequests)).toHaveLength(1);
    });

    it("keeps one request when both users send at once", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");

      const responses = await Promise.all([
        alice.client.post(REQUESTS).send({ email: bob.email }),
        bob.client.post(REQUESTS).send({ email: alice.email }),
        alice.client.post(REQUESTS).send({ email: bob.email }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(await db.select().from(friendRequests)).toHaveLength(1);
    });

    it("limits attempts per user, including unknown emails", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");

      await Promise.all(
        Array.from({ length: FRIEND_REQUEST_LIMIT }, () =>
          alice.client
            .post(REQUESTS)
            .send({ email: unknownEmail() })
            .expect(400)
        )
      );
      const limited = await alice.client
        .post(REQUESTS)
        .send({ email: bob.email })
        .expect(429);

      expectApiError(limited, "RATE_LIMITED");
      await sendRequest(bob, alice);
    });
  });

  describe("lists", () => {
    it("show the other user from each side, newest first", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "Carol");
      const toBob = await sendRequest(alice, bob);
      const toCarol = await sendRequest(alice, carol);
      const fromCarol = await sendRequest(carol, bob);

      expect(await listRequests(alice, SENT)).toEqual([
        { ...toCarol, user: friendUser(carol) },
        { ...toBob, user: friendUser(bob) },
      ]);
      expect(await listRequests(alice, INCOMING)).toEqual([]);
      expect(await listRequests(bob, INCOMING)).toEqual([
        { ...fromCarol, user: friendUser(carol) },
        { ...toBob, user: friendUser(alice) },
      ]);
      expect(await listRequests(bob, SENT)).toEqual([]);
      expect(await listRequests(carol, INCOMING)).toEqual([
        { ...toCarol, user: friendUser(alice) },
      ]);
    });
  });

  it.each([
    ["post", REQUESTS],
    ["get", INCOMING],
    ["get", SENT],
  ] as const)("requires a session for %s %s", async (method, path) => {
    await createClient(app)[method](path).send({}).expect(401);
  });

  describe("database constraints", () => {
    it("reject self and reversed pairs", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");
      await sendRequest(alice, bob);

      await expect(
        db
          .insert(friendRequests)
          .values({ requesterId: alice.id, recipientId: alice.id })
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        db
          .insert(friendRequests)
          .values({ requesterId: bob.id, recipientId: alice.id })
      ).rejects.toMatchObject({ cause: { code: "23505" } });
    });
  });
});
