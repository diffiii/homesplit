import { describe, expect, it } from "vitest";
import {
  isSignedOutPath,
  safeRedirectPath,
  signInUrl,
  signUpUrl,
} from "./session";

describe("safeRedirectPath", () => {
  it("keeps paths on this origin", () => {
    expect(safeRedirectPath("/households/1?tab=a")).toBe("/households/1?tab=a");
    expect(safeRedirectPath("/invitations/abc#top")).toBe(
      "/invitations/abc#top"
    );
  });

  it("falls back to / for anything else", () => {
    for (const target of [
      null,
      undefined,
      "",
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/\t/evil.test",
      "/\n/evil.test",
      "\\/evil.test",
      "households",
      "javascript:alert(1)",
    ]) {
      expect(safeRedirectPath(target), JSON.stringify(target)).toBe("/");
    }
  });

  it("doesn't return to a signed-out page", () => {
    expect(safeRedirectPath("/sign-in?redirectTo=%2Fx")).toBe("/");
    expect(safeRedirectPath("/sign-up")).toBe("/");
  });
});

describe("signed-out pages", () => {
  it("covers sign-in, sign-up, and the email link pages, not the app", () => {
    expect(isSignedOutPath("/sign-in")).toBe(true);
    expect(isSignedOutPath("/sign-up")).toBe(true);
    expect(isSignedOutPath("/reset-password")).toBe(true);
    expect(isSignedOutPath("/")).toBe(false);
    expect(isSignedOutPath("/invitations/abc")).toBe(false);
  });

  it("sends the visitor back where they were going", () => {
    expect(signInUrl("/households/1?x=1")).toBe(
      "/sign-in?redirectTo=%2Fhouseholds%2F1%3Fx%3D1"
    );
    expect(signUpUrl("/invitations/abc")).toBe(
      "/sign-up?redirectTo=%2Finvitations%2Fabc"
    );
  });

  it("leaves out redirectTo when it would only lead home", () => {
    expect(signInUrl("/")).toBe("/sign-in");
    expect(signUpUrl(null)).toBe("/sign-up");
    expect(signInUrl("https://evil.test")).toBe("/sign-in");
  });
});
