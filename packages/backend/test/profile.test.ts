import { randomUUID } from "node:crypto";
import { UserSummary } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createUser, TEST_PASSWORD, type TestUser } from "./helpers/fixtures";

const ME = "/api/me";

/** A URL of the caller's own avatar, as `PUT /api/me/avatar` gives it. */
const avatarOf = (userId: string) =>
  `https://avatars.invalid/${userId}/${randomUUID()}.webp`;

const storedUser = async (id: string) => {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row;
};

describe("profile", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function updateProfile(
    caller: TestUser,
    body: object
  ): Promise<UserSummary> {
    const response = await caller.client.patch(ME).send(body).expect(200);
    expect(response.body).not.toHaveProperty("email");
    expect(response.body).not.toHaveProperty("image");
    return UserSummary.parse(response.body);
  }

  describe("PATCH /api/me", () => {
    it("updates only the name", async () => {
      const alice = await createUser(app, "Alice");

      const summary = await updateProfile(alice, { name: "Alicja" });

      expect(summary).toEqual({ id: alice.id, name: "Alicja", imageUrl: null });
      expect(await storedUser(alice.id)).toMatchObject({
        name: "Alicja",
        image: null,
        email: alice.email,
      });
    });

    it("updates only the avatar and keeps the name", async () => {
      const alice = await createUser(app, "Alice");
      const avatar = avatarOf(alice.id);

      const summary = await updateProfile(alice, { imageUrl: avatar });

      expect(summary).toEqual({
        id: alice.id,
        name: "Alice",
        imageUrl: avatar,
      });
      expect(await storedUser(alice.id)).toMatchObject({
        name: "Alice",
        image: avatar,
      });
    });

    it("updates both fields and bumps updatedAt", async () => {
      const alice = await createUser(app, "Alice");
      const avatar = avatarOf(alice.id);
      const before = await storedUser(alice.id);

      const summary = await updateProfile(alice, {
        name: "Alicja",
        imageUrl: avatar,
      });

      expect(summary).toEqual({
        id: alice.id,
        name: "Alicja",
        imageUrl: avatar,
      });
      const after = await storedUser(alice.id);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime()
      );
    });

    it("clears the avatar with null", async () => {
      const alice = await createUser(app, "Alice");
      await updateProfile(alice, { imageUrl: avatarOf(alice.id) });

      const summary = await updateProfile(alice, { imageUrl: null });

      expect(summary.imageUrl).toBeNull();
      expect((await storedUser(alice.id)).image).toBeNull();
    });

    it("rejects an empty patch", async () => {
      const alice = await createUser(app, "Alice");

      const response = await alice.client.patch(ME).send({}).expect(400);

      expectApiError(response, "EMPTY_PATCH");
    });

    it("ignores auth-owned fields, which leaves an empty patch", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");

      const response = await alice.client
        .patch(ME)
        .send({ email: "taken@test.local", id: bob.id, emailVerified: false })
        .expect(400);

      expectApiError(response, "EMPTY_PATCH");
      // createUser verifies the email, and the body must not unverify it.
      expect(await storedUser(alice.id)).toMatchObject({
        email: alice.email,
        emailVerified: true,
      });
    });

    it("ignores another user's id and updates only the caller", async () => {
      const alice = await createUser(app, "Alice");
      const bob = await createUser(app, "Bob");

      const summary = await updateProfile(alice, { id: bob.id, name: "Eve" });

      expect(summary.id).toBe(alice.id);
      expect((await storedUser(alice.id)).name).toBe("Eve");
      expect((await storedUser(bob.id)).name).toBe("Bob");
    });

    it("trims the name", async () => {
      const alice = await createUser(app, "Alice");

      const summary = await updateProfile(alice, { name: "  Jan Kowalski  " });

      expect(summary.name).toBe("Jan Kowalski");
      expect((await storedUser(alice.id)).name).toBe("Jan Kowalski");
    });

    it.each([
      ["a non-URL avatar", { imageUrl: "not a url" }],
      ["a javascript: avatar", { imageUrl: "javascript:alert(1)" }],
      ["a data: avatar", { imageUrl: "data:image/png;base64,AAAA" }],
      ["an http: avatar", { imageUrl: "http://example.com/avatar.png" }],
      ["an avatar on another host", { imageUrl: "https://example.com/a.webp" }],
      ["an empty name", { name: "" }],
      ["a whitespace-only name", { name: "   " }],
      ["a name over 100 characters", { name: "a".repeat(101) }],
      ["a null name", { name: null }],
    ])("rejects %s", async (_label, body) => {
      const alice = await createUser(app, "Alice");

      const response = await alice.client.patch(ME).send(body).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(await storedUser(alice.id)).toMatchObject({
        name: "Alice",
        image: null,
      });
    });

    it("requires a session", async () => {
      await createClient(app).patch(ME).send({ name: "Eve" }).expect(401);
    });
  });

  describe("POST /api/auth/sign-up/email", () => {
    const signUp = (body: object) =>
      createClient(app)
        .post("/api/auth/sign-up/email")
        .send({
          email: `user-${randomUUID()}@test.local`,
          password: TEST_PASSWORD,
          ...body,
        });

    it("stores a trimmed name and the avatar", async () => {
      const response = await signUp({
        name: "  Jan Kowalski  ",
        image: "https://example.com/avatar.png",
      }).expect(200);

      expect(await storedUser(response.body.user.id)).toMatchObject({
        name: "Jan Kowalski",
        image: "https://example.com/avatar.png",
      });
    });

    it.each([
      ["a javascript: avatar", { name: "Alice", image: "javascript:alert(1)" }],
      ["an http: avatar", { name: "Alice", image: "http://example.com/a.png" }],
      ["a whitespace-only name", { name: "   " }],
      ["a name over 100 characters", { name: "a".repeat(101) }],
    ])("rejects %s", async (_label, body) => {
      const response = await signUp(body).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(await db.select().from(user)).toHaveLength(0);
    });
  });

  it("disables Better Auth's own profile update", async () => {
    const alice = await createUser(app, "Alice");

    await alice.client
      .post("/api/auth/update-user")
      .send({ image: "not a url" })
      .expect(404);

    expect((await storedUser(alice.id)).image).toBeNull();
  });
});
