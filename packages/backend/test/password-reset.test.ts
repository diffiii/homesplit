import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
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
import { PASSWORD_RESET } from "@/password-reset";
import { sessionCookie } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import { createUser, TEST_PASSWORD } from "./helpers/fixtures";
import { passwordResetEmails, passwordResetLink } from "./helpers/mail";

const NEW_PASSWORD = "a-brand-new-horse-battery-staple";
const MS_PER_SECOND = 1000;
const LINK_TTL_MS = PASSWORD_RESET.linkTtlSeconds * MS_PER_SECOND;
const WINDOW_MS = PASSWORD_RESET.windowSeconds * MS_PER_SECOND;

let nextHost = 0;

/** A visitor address no other test uses, so its limit starts fresh. */
function newIp(): string {
  nextHost += 1;
  return `198.51.100.${nextHost}`;
}

const unknownEmail = () => `nobody-${randomUUID()}@test.local`;

describe("password reset", () => {
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

  const requestReset = (email: string, ip = newIp(), redirectTo?: string) =>
    createClient(app)
      .post("/api/auth/request-password-reset")
      .set("X-Forwarded-For", ip)
      .send({ email, redirectTo });

  const resetPassword = (token: string, newPassword = NEW_PASSWORD) =>
    createClient(app)
      .post("/api/auth/reset-password")
      .send({ newPassword, token });

  const signIn = (email: string, password: string) =>
    createClient(app).post("/api/auth/sign-in/email").send({ email, password });

  const tokenFor = (email: string) =>
    passwordResetLink(email).searchParams.get("token") ?? "";

  describe("the request", () => {
    it("sends one email with a link to /reset-password on the frontend origin", async () => {
      const alice = await createUser(app, "Alice");

      await requestReset(alice.email).expect(200);

      expect(passwordResetEmails(alice.email)).toHaveLength(1);
      const link = passwordResetLink(alice.email);
      expect(`${link.origin}${link.pathname}`).toBe(
        `${process.env.FRONTEND_URL}/reset-password`
      );
      expect(link.searchParams.get("token")).toBeTruthy();
      expect(link.searchParams.has("redirectTo")).toBe(false);
    });

    it("carries the redirectTo the page asked for into the link", async () => {
      const alice = await createUser(app, "Alice");

      await requestReset(alice.email, newIp(), "/households").expect(200);

      expect(
        passwordResetLink(alice.email).searchParams.get("redirectTo")
      ).toBe("/households");
    });

    it("answers an unknown email like a known one, without sending", async () => {
      const alice = await createUser(app, "Alice");
      const unknown = unknownEmail();

      const known = await requestReset(alice.email).expect(200);
      const other = await requestReset(unknown).expect(200);

      expect(other.body).toEqual(known.body);
      expect(passwordResetEmails(unknown)).toHaveLength(0);
    });

    it("answers alike when sending fails, and sends on the next request", async () => {
      const alice = await createUser(app, "Alice");
      vi.spyOn(mailer, "send").mockRejectedValueOnce(
        new Error("provider down")
      );

      const failed = await requestReset(alice.email).expect(200);
      expect(passwordResetEmails(alice.email)).toHaveLength(0);

      const retried = await requestReset(alice.email).expect(200);
      expect(retried.body).toEqual(failed.body);
      expect(passwordResetEmails(alice.email)).toHaveLength(1);
    });
  });

  describe("resetting", () => {
    it("sets the new password and signs the user out everywhere", async () => {
      const alice = await createUser(app, "Alice");
      const phoneSignIn = await signIn(alice.email, TEST_PASSWORD).expect(200);
      const phone = createClient(app, sessionCookie(phoneSignIn));
      await requestReset(alice.email).expect(200);

      const reset = await resetPassword(tokenFor(alice.email)).expect(200);

      expect(reset.headers["set-cookie"]).toBeUndefined();
      const own = await alice.client.get("/api/auth/get-session").expect(200);
      const other = await phone.get("/api/auth/get-session").expect(200);
      expect(own.body).toBeNull();
      expect(other.body).toBeNull();
      const old = await signIn(alice.email, TEST_PASSWORD).expect(401);
      expect(old.body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
      await signIn(alice.email, NEW_PASSWORD).expect(200);
    });

    it("works once", async () => {
      const alice = await createUser(app, "Alice");
      await requestReset(alice.email).expect(200);
      const token = tokenFor(alice.email);
      await resetPassword(token).expect(200);

      const again = await resetPassword(
        token,
        "yet-another-horse-battery-staple"
      ).expect(400);

      expect(again.body.code).toBe("INVALID_TOKEN");
      await signIn(alice.email, NEW_PASSWORD).expect(200);
    });

    it("rejects an expired token and keeps the old password", async () => {
      const alice = await createUser(app, "Alice");
      await requestReset(alice.email).expect(200);
      const token = tokenFor(alice.email);

      vi.useFakeTimers({
        toFake: ["Date"],
        now: Date.now() + LINK_TTL_MS + MS_PER_SECOND,
      });
      const response = await resetPassword(token).expect(400);
      vi.useRealTimers();

      expect(response.body.code).toBe("INVALID_TOKEN");
      await signIn(alice.email, TEST_PASSWORD).expect(200);
    });

    it("rejects an unknown token", async () => {
      const response = await resetPassword("not-a-real-token").expect(400);

      expect(response.body.code).toBe("INVALID_TOKEN");
    });

    it("rejects a too short password without using up the token", async () => {
      const alice = await createUser(app, "Alice");
      await requestReset(alice.email).expect(200);
      const token = tokenFor(alice.email);

      const short = await resetPassword(token, "short").expect(400);

      expect(short.body.code).toBe("PASSWORD_TOO_SHORT");
      await resetPassword(token).expect(200);
    });
  });

  describe("limits", () => {
    it("limits the requests from one address and not from others", async () => {
      const ip = newIp();
      await Promise.all(
        Array.from({ length: PASSWORD_RESET.maxRequestsPerIp }, () =>
          requestReset(unknownEmail(), ip).expect(200)
        )
      );

      const limited = await requestReset(unknownEmail(), ip).expect(429);

      expect(limited.body.code).toBe("RATE_LIMITED");
      await requestReset(unknownEmail(), newIp()).expect(200);
    });

    it("caps the emails to one address and answers the same", async () => {
      const alice = await createUser(app, "Alice");

      const responses = await Promise.all(
        Array.from({ length: PASSWORD_RESET.maxEmailsPerAddress + 1 }, () =>
          requestReset(alice.email).expect(200)
        )
      );

      expect(passwordResetEmails(alice.email)).toHaveLength(
        PASSWORD_RESET.maxEmailsPerAddress
      );
      for (const response of responses) {
        expect(response.body).toEqual(responses[0]?.body);
      }
    });

    it("sends to an address again once the window has passed", async () => {
      const alice = await createUser(app, "Alice");
      await Promise.all(
        Array.from({ length: PASSWORD_RESET.maxEmailsPerAddress }, () =>
          requestReset(alice.email).expect(200)
        )
      );

      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + WINDOW_MS });
      await requestReset(alice.email).expect(200);
      vi.useRealTimers();

      expect(passwordResetEmails(alice.email)).toHaveLength(
        PASSWORD_RESET.maxEmailsPerAddress + 1
      );
    });
  });
});
