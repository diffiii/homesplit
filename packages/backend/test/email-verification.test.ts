import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { capturedEmails } from "@/mail";
import { sessionCookie } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createHousehold, createUser, TEST_PASSWORD } from "./helpers/fixtures";
import {
  verificationEmails,
  verificationLink,
  waitForVerificationEmails,
} from "./helpers/mail";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const DAY_MS = 86_400 * 1000;
const LIST_USER_INVITATIONS = "/api/auth/organization/list-user-invitations";

const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID()}@test.local`;

describe("email verification", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    capturedEmails.length = 0;
    send.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const signUp = (email: string) =>
    createClient(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Alice", email, password: TEST_PASSWORD });

  const signIn = (email: string) =>
    createClient(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: TEST_PASSWORD });

  const openLink = (email: string) =>
    createClient(app).get(verificationLink(email).path);

  describe("sign-up", () => {
    it("sends exactly one email whose link points at the frontend URL", async () => {
      const email = uniqueEmail("signup");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);

      const { url } = verificationLink(email);
      expect(url.origin).toBe(
        new URL(process.env.FRONTEND_URL as string).origin
      );
      expect(url.searchParams.get("token")).toBeTruthy();
    });

    it("blocks sign-in until the email is verified", async () => {
      const email = uniqueEmail("blocked");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);

      const response = await signIn(email).expect(403);
      expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
    });
  });

  describe("verification", () => {
    it("verifies the email and signs the user in", async () => {
      const email = uniqueEmail("verify");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);
      const verified = await openLink(email).expect(200);

      const session = await createClient(app, sessionCookie(verified))
        .get("/api/auth/get-session")
        .expect(200);
      expect(session.body.user.email).toBe(email);
      expect(session.body.user.emailVerified).toBe(true);
      await signIn(email).expect(200);
    });

    it("rejects a tampered token", async () => {
      const email = uniqueEmail("tampered");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);

      const { path } = verificationLink(email);
      const tampered = path.slice(0, -1) + (path.endsWith("a") ? "b" : "a");
      const response = await createClient(app).get(tampered);

      expect([400, 401]).toContain(response.status);
      await signIn(email).expect(403);
    });

    it("rejects an expired link and leaves the account unverified", async () => {
      const email = uniqueEmail("expired");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);
      const { path } = verificationLink(email);

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + DAY_MS + 60_000);
      const response = await createClient(app).get(path);
      vi.useRealTimers();

      expect([400, 401]).toContain(response.status);
      await signIn(email).expect(403);
    });

    it("replaying a used link does not break the verified account", async () => {
      const email = uniqueEmail("replay");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);
      const { path } = verificationLink(email);

      await createClient(app).get(path).expect(200);
      // Better Auth tokens are signed and stateless, so a replay is not a 5xx
      // and must not change anything.
      const replay = await createClient(app).get(path);
      expect(replay.status).toBeLessThan(500);
      await signIn(email).expect(200);
    });
  });

  describe("resending", () => {
    it("sends a fresh email on request", async () => {
      const email = uniqueEmail("resend");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);

      await createClient(app)
        .post("/api/auth/send-verification-email")
        .send({ email })
        .expect(200);
      await waitForVerificationEmails(email, 2);

      await openLink(email).expect(200);
      await signIn(email).expect(200);
    });

    it("sends a fresh email when an unverified user tries to sign in", async () => {
      const email = uniqueEmail("signin-resend");

      await signUp(email).expect(200);
      await waitForVerificationEmails(email, 1);

      await signIn(email).expect(403);
      await waitForVerificationEmails(email, 2);
    });

    it("recovers when the provider failed during sign-up", async () => {
      const email = uniqueEmail("provider-error");

      send.mockResolvedValue({
        data: null,
        error: { message: "provider down" },
      });
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RESEND_API_KEY", "re_test");
      try {
        await signUp(email).expect(200);
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      } finally {
        vi.unstubAllEnvs();
      }
      expect(verificationEmails(email)).toHaveLength(0);

      // The account exists, so sign-in resends instead of leaving it stuck.
      await signIn(email).expect(403);
      await waitForVerificationEmails(email, 1);
      await openLink(email).expect(200);
      await signIn(email).expect(200);
    });
  });

  describe("invitations", () => {
    it("lists the invitee's invitations only once they have a verified session", async () => {
      const owner = await createUser(app, "Owner");
      const household = await createHousehold(owner);
      const inviteeEmail = uniqueEmail("invitee");

      await owner.client
        .post("/api/auth/organization/invite-member")
        .send({
          email: inviteeEmail,
          organizationId: household.id,
          role: "member",
        })
        .expect(200);

      await signUp(inviteeEmail).expect(200);
      await waitForVerificationEmails(inviteeEmail, 1);

      // Before verification there is no session, so Better Auth rejects the call.
      await signIn(inviteeEmail).expect(403);
      const anonymous = await createClient(app).get(LIST_USER_INVITATIONS);
      expect(anonymous.status).toBeGreaterThanOrEqual(400);
      expect(anonymous.status).toBeLessThan(500);

      const verified = await openLink(inviteeEmail).expect(200);
      const response = await createClient(app, sessionCookie(verified))
        .get(LIST_USER_INVITATIONS)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: inviteeEmail,
            organizationId: household.id,
          }),
        ])
      );
    });
  });
});
