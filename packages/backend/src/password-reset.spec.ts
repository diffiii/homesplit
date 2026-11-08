import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_SUBJECT,
  passwordResetEmail,
  resetLink,
} from "./password-reset";

const FRONTEND = "https://homesplit.test";

/** What Better Auth passes as `url`, with the page's `redirectTo` as `callbackURL`. */
function authUrl(callbackURL?: string): string {
  const url = new URL(`${FRONTEND}/api/auth/reset-password/abc`);
  if (callbackURL !== undefined) {
    url.searchParams.set("callbackURL", callbackURL);
  }
  return url.toString();
}

describe("resetLink", () => {
  it("links to the reset page with the token", () => {
    const link = new URL(resetLink(FRONTEND, "a b&c", authUrl()));

    expect(`${link.origin}${link.pathname}`).toBe(`${FRONTEND}/reset-password`);
    expect(link.searchParams.get("token")).toBe("a b&c");
    expect(link.searchParams.has("redirectTo")).toBe(false);
  });

  it("carries a path on the frontend as redirectTo", () => {
    const link = new URL(
      resetLink(FRONTEND, "tok", authUrl("/invitations/abc?x=1"))
    );

    expect(link.searchParams.get("redirectTo")).toBe("/invitations/abc?x=1");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "undefined",
    "",
  ])("leaves out %j as redirectTo", (callbackURL) => {
    const link = new URL(resetLink(FRONTEND, "tok", authUrl(callbackURL)));

    expect(link.searchParams.has("redirectTo")).toBe(false);
  });
});

describe("passwordResetEmail", () => {
  it("puts the link in both the text and the HTML", () => {
    const link = `${FRONTEND}/reset-password?token=tok`;

    const email = passwordResetEmail("user@example.com", link);

    expect(email.to).toBe("user@example.com");
    expect(email.subject).toBe(PASSWORD_RESET_SUBJECT);
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
  });
});
