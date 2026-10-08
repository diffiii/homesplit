import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db";
import { member, organization, user } from "../src/db/schema";
import { createClient, createTestApp } from "./helpers/app";
import { createTwoHouseholds, createUser } from "./helpers/fixtures";

describe("auth and organization schema", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("stores signed-up users and returns their session", async () => {
    const alice = await createUser(app, "Alice");

    const [row] = await db.select().from(user).where(eq(user.id, alice.id));
    expect(row).toMatchObject({ email: alice.email, name: "Alice" });

    const session = await alice.client.get("/api/auth/get-session").expect(200);
    expect(session.body.user.id).toBe(alice.id);
  });

  it("has no session for unauthenticated clients", async () => {
    const session = await createClient(app)
      .get("/api/auth/get-session")
      .expect(200);

    expect(session.body).toBeNull();
  });

  it("rejects household creation without a session", async () => {
    await createClient(app)
      .post("/api/auth/organization/create")
      .send({ name: "Nope", slug: crypto.randomUUID() })
      .expect(401);

    expect(await db.select().from(organization)).toHaveLength(0);
  });

  it("keeps two households separate", async () => {
    const { alice, bob } = await createTwoHouseholds(app);

    expect(alice.household.id).not.toBe(bob.household.id);

    const memberships = await db
      .select({ orgId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, alice.id));
    expect(memberships).toEqual([{ orgId: alice.household.id, role: "owner" }]);

    const listed = await alice.client
      .get("/api/auth/organization/list")
      .expect(200);
    expect(listed.body.map((org: { id: string }) => org.id)).toEqual([
      alice.household.id,
    ]);
  });
});
