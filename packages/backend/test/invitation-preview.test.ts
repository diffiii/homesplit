import { randomUUID } from "node:crypto";
import { InvitationPreview } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { invitation } from "@/db/schema";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp, type TestClient } from "./helpers/app";
import {
  createHousehold,
  createUser,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const ORG = "/api/auth/organization";
const preview = (id: string) => `/api/invitations/${id}`;
const ONE_MINUTE_MS = 60_000;

describe("invitation preview", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function invite(
    inviter: TestUser,
    household: TestHousehold,
    email: string,
    role = "member"
  ): Promise<string> {
    const response = await inviter.client
      .post(`${ORG}/invite-member`)
      .send({ email, organizationId: household.id, role })
      .expect(200);
    return response.body.id;
  }

  /** Alice's household, with Bob invited as an admin. */
  async function setup() {
    const alice = await createUser(app, "Alice");
    const household = await createHousehold(alice, "The Flat");
    const bob = await createUser(app, "Bob");
    const invitationId = await invite(alice, household, bob.email, "admin");
    return { alice, bob, household, invitationId };
  }

  const answer = (client: TestClient, action: string, invitationId: string) =>
    client.post(`${ORG}/${action}`).send({ invitationId });

  it("shows the household, the inviter, the address, and the role", async () => {
    const { alice, bob, household, invitationId } = await setup();

    const response = await bob.client.get(preview(invitationId)).expect(200);

    const body = InvitationPreview.parse(response.body);
    expect(body).toEqual({
      id: invitationId,
      household: { id: household.id, name: "The Flat" },
      inviter: { id: alice.id, name: "Alice", imageUrl: null },
      email: bob.email,
      role: "admin",
      status: "pending",
      expiresAt: expect.any(String),
    });
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("shows the address to a user signed in with another one", async () => {
    const { bob, invitationId } = await setup();
    const carol = await createUser(app, "Carol");

    const response = await carol.client.get(preview(invitationId)).expect(200);

    expect(response.body.email).toBe(bob.email);
  });

  it.each([
    ["accept-invitation", "accepted"],
    ["reject-invitation", "rejected"],
  ])("reports an invitation answered with %s as %s", async (action, status) => {
    const { bob, invitationId } = await setup();
    await answer(bob.client, action, invitationId).expect(200);

    const response = await bob.client.get(preview(invitationId)).expect(200);

    expect(response.body.status).toBe(status);
  });

  it("reports a cancelled invitation", async () => {
    const { alice, bob, invitationId } = await setup();
    await answer(alice.client, "cancel-invitation", invitationId).expect(200);

    const response = await bob.client.get(preview(invitationId)).expect(200);

    expect(response.body.status).toBe("canceled");
  });

  it("reports an invitation replaced by a newer one as cancelled", async () => {
    const { alice, bob, household, invitationId } = await setup();
    await invite(alice, household, bob.email);

    const response = await bob.client.get(preview(invitationId)).expect(200);

    expect(response.body.status).toBe("canceled");
  });

  it("reports a pending invitation past its expiry as expired", async () => {
    const { bob, invitationId } = await setup();
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - ONE_MINUTE_MS) })
      .where(eq(invitation.id, invitationId));

    const response = await bob.client.get(preview(invitationId)).expect(200);

    expect(response.body.status).toBe("expired");
  });

  it("answers 404 for an unknown invitation", async () => {
    const { bob } = await setup();

    const response = await bob.client.get(preview(randomUUID())).expect(404);

    expectApiError(response, "NOT_FOUND");
  });

  it("answers 400 for an ID that isn't a UUID", async () => {
    const { bob } = await setup();

    const response = await bob.client.get(preview("not-a-uuid")).expect(400);

    expectApiError(response, "VALIDATION_ERROR");
  });

  it("answers 401 to a visitor who isn't signed in", async () => {
    const { invitationId } = await setup();

    await createClient(app).get(preview(invitationId)).expect(401);
  });
});
