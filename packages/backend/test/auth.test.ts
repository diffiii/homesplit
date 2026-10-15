import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { member, organization, user } from "@/db/schema";
import { capturedEmails } from "@/mail";
import { createClient, createTestApp } from "./helpers/app";
import {
  createTwoHouseholds,
  createUser,
  TEST_PASSWORD,
  verificationLinkFor,
} from "./helpers/fixtures";

describe("auth and organization schema", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
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

  it("emails a verification link to the frontend's page", async () => {
    const email = `user-${crypto.randomUUID()}@test.local`;
    await createClient(app)
      .post("/api/auth/sign-up/email")
      .send({
        callbackURL: "/invitations/abc",
        email,
        name: "Alice",
        password: TEST_PASSWORD,
      })
      .expect(200);

    const link = verificationLinkFor(email);
    expect(`${link.origin}${link.pathname}`).toBe(
      `${process.env.FRONTEND_URL}/verify-email`
    );
    expect(link.searchParams.get("token")).toBeTruthy();
    expect(link.searchParams.get("redirectTo")).toBe("/invitations/abc");
  });

  it("rejects sign-in until the email is verified", async () => {
    const email = `user-${crypto.randomUUID()}@test.local`;
    await createClient(app)
      .post("/api/auth/sign-up/email")
      .send({ email, name: "Alice", password: TEST_PASSWORD })
      .expect(200);

    const signedIn = await createClient(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: TEST_PASSWORD })
      .expect(403);
    expect(signedIn.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("answers a sign-up for an existing email like a new one", async () => {
    const alice = await createUser(app, "Alice");

    const again = await createClient(app)
      .post("/api/auth/sign-up/email")
      .send({ email: alice.email, name: "Mallory", password: TEST_PASSWORD })
      .expect(200);
    expect(again.body).toMatchObject({
      token: null,
      user: { email: alice.email, name: "Mallory" },
    });
    expect(again.body.user.id).not.toBe(alice.id);

    const sent = capturedEmails.findLast(
      (captured) => captured.to === alice.email
    );
    expect(sent?.subject).toBe("You already have a HomeSplit account");
    expect(sent?.html).toContain(`href="${process.env.FRONTEND_URL}/sign-in"`);
  });
});
