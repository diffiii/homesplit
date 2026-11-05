import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mailer } from "@/auth";
import { db } from "@/db";
import { invitation, member } from "@/db/schema";
import { INVITATION } from "@/household-invitations";
import { createClient, createTestApp, type TestClient } from "./helpers/app";
import {
  createHousehold,
  createUser,
  inviteAndAccept,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { invitationEmails, invitationLink } from "./helpers/invitation-mail";

const ORG = "/api/auth/organization";
const MS_PER_SECOND = 1000;
const ONE_MINUTE_MS = 60_000;
const EXPIRY_MS = INVITATION.expiresInSeconds * MS_PER_SECOND;

const guestEmail = () => `guest-${randomUUID()}@test.local`;

describe("household invitation emails", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const invite = (
    inviter: TestUser,
    household: TestHousehold,
    email: string,
    role = "member",
    extra: object = {}
  ) =>
    inviter.client
      .post(`${ORG}/invite-member`)
      .send({ email, organizationId: household.id, role, ...extra });

  const accept = (client: TestClient, invitationId: string) =>
    client.post(`${ORG}/accept-invitation`).send({ invitationId });

  const cancel = (client: TestClient, invitationId: string) =>
    client.post(`${ORG}/cancel-invitation`).send({ invitationId });

  async function invitationRow(id: string) {
    const [row] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.id, id));
    return row;
  }

  async function isMember(householdId: string, userId: string) {
    const rows = await db
      .select()
      .from(member)
      .where(
        and(eq(member.organizationId, householdId), eq(member.userId, userId))
      );
    return rows.length > 0;
  }

  /** Alice owns a household with Carol as a member and Dave as an admin. */
  async function setup() {
    const alice = await createUser(app, "Alice");
    const household = await createHousehold(alice, "The Flat");
    const carol = await createUser(app, "Carol");
    const dave = await createUser(app, "Dave");
    await inviteAndAccept(alice, household, carol, "member");
    await inviteAndAccept(alice, household, dave, "admin");
    return { alice, carol, dave, household };
  }

  describe("the email", () => {
    it("names the household and the inviter and links to the invitation", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice, "The Flat");
      const bob = await createUser(app, "Bob");

      const sent = await invite(alice, household, bob.email).expect(200);

      const emails = invitationEmails(bob.email);
      expect(emails).toHaveLength(1);
      expect(emails[0]?.text).toContain("Alice");
      expect(emails[0]?.text).toContain("The Flat");
      const link = invitationLink(bob.email);
      expect(link.id).toBe(sent.body.id);
      expect(link.url.href).toBe(
        `${process.env.FRONTEND_URL}/invitations/${sent.body.id}`
      );
    });

    it("escapes the household name in the HTML", async () => {
      const alice = await createUser(app, "Alice");
      const name = "<script>alert(1)</script> & co";
      const household = await createHousehold(alice, name);
      const bob = await createUser(app, "Bob");

      await invite(alice, household, bob.email).expect(200);

      const [email] = invitationEmails(bob.email);
      expect(email?.html).not.toContain("<script>");
      expect(email?.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(email?.text).toContain(name);
    });
  });

  describe("who can invite", () => {
    it("lets admins invite and keeps members out", async () => {
      const { carol, dave, household } = await setup();
      const guest = guestEmail();

      await invite(carol, household, guest).expect(403);
      expect(invitationEmails(guest)).toHaveLength(0);

      await invite(dave, household, guest).expect(200);
      expect(invitationEmails(guest)).toHaveLength(1);
    });

    it("lets only an owner invite an owner", async () => {
      const { alice, dave, household } = await setup();
      const guest = guestEmail();

      await invite(dave, household, guest, "owner").expect(403);
      expect(invitationEmails(guest)).toHaveLength(0);

      await invite(alice, household, guest, "owner").expect(200);
      expect(invitationEmails(guest)).toHaveLength(1);
    });

    it("lets admins cancel invitations and keeps members out", async () => {
      const { alice, carol, dave, household } = await setup();
      const sent = await invite(alice, household, guestEmail()).expect(200);

      await cancel(carol.client, sent.body.id).expect(403);
      expect((await invitationRow(sent.body.id))?.status).toBe("pending");

      await cancel(dave.client, sent.body.id).expect(200);
      expect((await invitationRow(sent.body.id))?.status).toBe("canceled");
    });
  });

  describe("accepting", () => {
    it("makes the invited user a member", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const sent = await invite(alice, household, bob.email).expect(200);

      await accept(bob.client, sent.body.id).expect(200);

      expect(await isMember(household.id, bob.id)).toBe(true);
      expect((await invitationRow(sent.body.id))?.status).toBe("accepted");
    });

    it("refuses a signed-in user with another email", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const carol = await createUser(app, "Carol");
      const sent = await invite(alice, household, bob.email).expect(200);

      await accept(carol.client, sent.body.id).expect(403);

      expect(await isMember(household.id, carol.id)).toBe(false);
      expect((await invitationRow(sent.body.id))?.status).toBe("pending");
      await accept(bob.client, sent.body.id).expect(200);
    });

    it("refuses a visitor who isn't signed in", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const sent = await invite(alice, household, bob.email).expect(200);

      const response = await accept(createClient(app), sent.body.id);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(await isMember(household.id, bob.id)).toBe(false);
    });

    it("can't be accepted twice", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const sent = await invite(alice, household, bob.email).expect(200);
      await accept(bob.client, sent.body.id).expect(200);

      await accept(bob.client, sent.body.id).expect(400);
    });
  });

  describe("expiry", () => {
    it("lasts the configured time", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);

      const sent = await invite(alice, household, guestEmail()).expect(200);

      const row = await invitationRow(sent.body.id);
      const remaining = (row?.expiresAt.getTime() ?? 0) - Date.now();
      expect(remaining).toBeGreaterThan(EXPIRY_MS - ONE_MINUTE_MS);
      expect(remaining).toBeLessThanOrEqual(EXPIRY_MS);
    });

    it("can't be accepted once expired", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const sent = await invite(alice, household, bob.email).expect(200);
      await db
        .update(invitation)
        .set({ expiresAt: new Date(Date.now() - MS_PER_SECOND) })
        .where(eq(invitation.id, sent.body.id));

      await accept(bob.client, sent.body.id).expect(400);

      expect(await isMember(household.id, bob.id)).toBe(false);
    });
  });

  describe("cancelling and inviting again", () => {
    it("can't be accepted once cancelled", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const sent = await invite(alice, household, bob.email).expect(200);
      await cancel(alice.client, sent.body.id).expect(200);

      await accept(bob.client, sent.body.id).expect(400);

      expect(await isMember(household.id, bob.id)).toBe(false);
    });

    it("cancels the earlier invitation when the address is invited again", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const first = await invite(alice, household, bob.email).expect(200);

      const second = await invite(alice, household, bob.email).expect(200);

      expect(second.body.id).not.toBe(first.body.id);
      expect((await invitationRow(first.body.id))?.status).toBe("canceled");
      expect((await invitationRow(second.body.id))?.status).toBe("pending");
      expect(invitationEmails(bob.email)).toHaveLength(2);
      expect(invitationLink(bob.email).id).toBe(second.body.id);
      await accept(bob.client, first.body.id).expect(400);
      await accept(bob.client, second.body.id).expect(200);
    });

    it("sends the same invitation again with resend", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      const first = await invite(alice, household, bob.email).expect(200);

      const again = await invite(alice, household, bob.email, "member", {
        resend: true,
      }).expect(200);

      expect(again.body.id).toBe(first.body.id);
      expect((await invitationRow(first.body.id))?.status).toBe("pending");
      expect(invitationEmails(bob.email)).toHaveLength(2);
      expect(invitationLink(bob.email).id).toBe(first.body.id);
    });
  });

  describe("a failed send", () => {
    it("leaves an invitation the inviter can see and send again", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);
      const bob = await createUser(app, "Bob");
      vi.spyOn(mailer, "send").mockRejectedValueOnce(
        new Error("provider down")
      );

      const failed = await invite(alice, household, bob.email).expect(200);

      expect(invitationEmails(bob.email)).toHaveLength(0);
      const listed = await alice.client
        .get(`${ORG}/list-invitations?organizationId=${household.id}`)
        .expect(200);
      expect(listed.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: failed.body.id,
            email: bob.email,
            status: "pending",
          }),
        ])
      );

      const again = await invite(alice, household, bob.email).expect(200);

      expect(invitationEmails(bob.email)).toHaveLength(1);
      expect((await invitationRow(failed.body.id))?.status).toBe("canceled");
      await accept(bob.client, again.body.id).expect(200);
    });
  });
});
