import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
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
import { user } from "@/db/schema";
import { sessionCookie } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createHousehold, createUser, TEST_PASSWORD } from "./helpers/fixtures";
import { verificationEmails, verificationLink } from "./helpers/mail";

const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const LIST_USER_INVITATIONS = "/api/auth/organization/list-user-invitations";

const newEmail = () => `user-${randomUUID()}@test.local`;

describe("email verification", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const signUp = (email: string, callbackURL?: string) =>
    createClient(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Alice", email, password: TEST_PASSWORD, callbackURL });

  const signIn = (email: string) =>
    createClient(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: TEST_PASSWORD });

  const openLink = (email: string) =>
    createClient(app).get(verificationLink(email).path);

  const isVerified = async (email: string) => {
    const [row] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email));
    return row?.emailVerified;
  };

  describe("sign-up", () => {
    it("sends one email with a link to verify-email on the frontend origin", async () => {
      const email = newEmail();

      const response = await signUp(email).expect(200);

      expect(response.body.token).toBeNull();
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(verificationEmails(email)).toHaveLength(1);
      const { url } = verificationLink(email);
      expect(`${url.origin}${url.pathname}`).toBe(
        `${process.env.FRONTEND_URL}/api/auth/verify-email`
      );
      expect(url.searchParams.get("token")).toBeTruthy();
      expect(await isVerified(email)).toBe(false);
    });

    it("blocks sign-in until the email is verified", async () => {
      const email = newEmail();
      await signUp(email).expect(200);

      const response = await signIn(email).expect(403);

      expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("answers a sign-up for a taken email like a new one, without email", async () => {
      const email = newEmail();
      await signUp(email).expect(200);

      const response = await signUp(email).expect(200);

      expect(response.body.token).toBeNull();
      expect(verificationEmails(email)).toHaveLength(1);
    });
  });

  describe("the link", () => {
    it("verifies the email and signs the user in", async () => {
      const email = newEmail();
      await signUp(email).expect(200);

      const verified = await openLink(email).expect(200);

      const session = await createClient(app, sessionCookie(verified))
        .get("/api/auth/get-session")
        .expect(200);
      expect(session.body.user).toMatchObject({ email, emailVerified: true });
      expect(await isVerified(email)).toBe(true);
      await signIn(email).expect(200);
    });

    it("redirects to the callbackURL given at sign-up", async () => {
      const email = newEmail();
      await signUp(email, "/households").expect(200);
      const { url } = verificationLink(email);

      const response = await createClient(app)
        .get(`${url.pathname}${url.search}`)
        .expect(302);

      expect(response.headers.location).toBe("/households");
      expect(sessionCookie(response)).toBeTruthy();
    });

    it("rejects a tampered token", async () => {
      const email = newEmail();
      await signUp(email).expect(200);
      const token = verificationLink(email).url.searchParams.get("token") ?? "";

      const response = await createClient(app)
        .get(`/api/auth/verify-email?token=${token.slice(0, -2)}xx`)
        .expect(401);

      expect(response.body.code).toBe("INVALID_TOKEN");
      expect(await isVerified(email)).toBe(false);
    });

    it("rejects an expired link", async () => {
      const email = newEmail();
      await signUp(email).expect(200);
      const { path } = verificationLink(email);

      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + LINK_TTL_MS });
      const response = await createClient(app).get(path).expect(401);
      vi.useRealTimers();

      expect(response.body.code).toBe("TOKEN_EXPIRED");
      expect(await isVerified(email)).toBe(false);
    });

    it("doesn't sign anyone in when opened again", async () => {
      const email = newEmail();
      await signUp(email).expect(200);
      const { path } = verificationLink(email);
      await createClient(app).get(path).expect(200);

      const replay = await createClient(app).get(path).expect(200);

      expect(replay.body).toEqual({ status: true, user: null });
      expect(replay.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("resending", () => {
    it("sends a new link on request", async () => {
      const email = newEmail();
      await signUp(email).expect(200);

      await createClient(app)
        .post("/api/auth/send-verification-email")
        .send({ email })
        .expect(200);

      expect(verificationEmails(email)).toHaveLength(2);
      await openLink(email).expect(200);
      expect(await isVerified(email)).toBe(true);
    });

    it("answers a request for an unknown or verified email without sending", async () => {
      const verified = await createUser(app);
      const unknown = newEmail();

      await Promise.all(
        [verified.email, unknown].map((email) =>
          createClient(app)
            .post("/api/auth/send-verification-email")
            .send({ email })
            .expect(200)
        )
      );

      expect(verificationEmails(verified.email)).toHaveLength(1);
      expect(verificationEmails(unknown)).toHaveLength(0);
    });

    it("sends a new link when an unverified user signs in after theirs expired", async () => {
      const email = newEmail();
      await signUp(email).expect(200);

      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + LINK_TTL_MS });
      await signIn(email).expect(403);
      expect(verificationEmails(email)).toHaveLength(2);
      await openLink(email).expect(200);
      vi.useRealTimers();

      expect(await isVerified(email)).toBe(true);
    });

    it("still creates the account when sending fails, and sign-in sends again", async () => {
      const email = newEmail();
      vi.spyOn(mailer, "send").mockRejectedValueOnce(
        new Error("provider down")
      );

      await signUp(email).expect(200);
      expect(verificationEmails(email)).toHaveLength(0);

      await signIn(email).expect(403);
      expect(verificationEmails(email)).toHaveLength(1);
      await openLink(email).expect(200);
      await signIn(email).expect(200);
    });
  });

  describe("invitations", () => {
    it("lists an invitee's invitations once their email is verified", async () => {
      const owner = await createUser(app, "Owner");
      const household = await createHousehold(owner);
      const email = newEmail();
      await owner.client
        .post("/api/auth/organization/invite-member")
        .send({ email, organizationId: household.id, role: "member" })
        .expect(200);
      await signUp(email).expect(200);

      // Unverified, the invitee can't sign in, and without a session Better
      // Auth answers 400.
      await signIn(email).expect(403);
      await createClient(app).get(LIST_USER_INVITATIONS).expect(400);

      const verified = await openLink(email).expect(200);
      const response = await createClient(app, sessionCookie(verified))
        .get(LIST_USER_INVITATIONS)
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({ email, organizationId: household.id }),
      ]);
    });
  });
});
