import { UserSummary } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createUser, type TestUser } from "./helpers/fixtures";

const ME = "/api/me";
const AVATAR = "https://example.com/avatar.png";

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

      const summary = await updateProfile(alice, { imageUrl: AVATAR });

      expect(summary).toEqual({
        id: alice.id,
        name: "Alice",
        imageUrl: AVATAR,
      });
      expect(await storedUser(alice.id)).toMatchObject({
        name: "Alice",
        image: AVATAR,
      });
    });

    it("updates both fields and bumps updatedAt", async () => {
      const alice = await createUser(app, "Alice");
      const before = await storedUser(alice.id);

      const summary = await updateProfile(alice, {
        name: "Alicja",
        imageUrl: AVATAR,
      });

      expect(summary).toEqual({
        id: alice.id,
        name: "Alicja",
        imageUrl: AVATAR,
      });
      const after = await storedUser(alice.id);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime()
      );
    });

    it("clears the avatar with null", async () => {
      const alice = await createUser(app, "Alice");
      await updateProfile(alice, { imageUrl: AVATAR });

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
        .send({ email: "taken@test.local", id: bob.id, emailVerified: true })
        .expect(400);

      expectApiError(response, "EMPTY_PATCH");
      expect(await storedUser(alice.id)).toMatchObject({
        email: alice.email,
        emailVerified: false,
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

    it.each([
      ["a non-URL avatar", { imageUrl: "not a url" }],
      ["an empty name", { name: "" }],
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

  it("disables Better Auth's own profile update", async () => {
    const alice = await createUser(app, "Alice");

    await alice.client
      .post("/api/auth/update-user")
      .send({ image: "not a url" })
      .expect(404);

    expect((await storedUser(alice.id)).image).toBeNull();
  });
});
