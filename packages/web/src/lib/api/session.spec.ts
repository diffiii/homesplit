import { describe, expect, it } from "vitest";
import { isSignedOutPath, safeRedirectPath, signInUrl } from "./session";

describe("safeRedirectPath", () => {
  it("keeps paths on this origin", () => {
    expect(safeRedirectPath("/households/1?tab=a")).toBe("/households/1?tab=a");
  });

  it("falls back to / for anything else", () => {
    for (const target of [
      null,
      undefined,
      "",
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "households",
    ]) {
      expect(safeRedirectPath(target)).toBe("/");
    }
  });
});

describe("signed-out pages", () => {
  it("covers sign-in and the email link pages, not the app", () => {
    expect(isSignedOutPath("/sign-in")).toBe(true);
    expect(isSignedOutPath("/reset-password")).toBe(true);
    expect(isSignedOutPath("/")).toBe(false);
    expect(isSignedOutPath("/invitations/abc")).toBe(false);
  });

  it("sends the visitor back where they were going", () => {
    expect(signInUrl("/households/1?x=1")).toBe(
      "/sign-in?redirectTo=%2Fhouseholds%2F1%3Fx%3D1"
    );
  });
});
