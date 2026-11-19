import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const SESSION_COOKIE = "better-auth.session_token=session";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "https://homesplit.test"), {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("shows the landing page at / without a session cookie", () => {
    const response = proxy(request("/"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("shows the signed-in home at / with a session cookie", () => {
    const response = proxy(request("/?from=pwa", SESSION_COOKIE));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://homesplit.test/home?from=pwa"
    );
  });

  it("sends visitors without a session cookie from other pages to sign-in", () => {
    const response = proxy(request("/households?tab=all"));

    expect(response.headers.get("location")).toBe(
      "https://homesplit.test/sign-in?redirectTo=%2Fhouseholds%3Ftab%3Dall"
    );
  });

  it("sends visitors without a session cookie from an invitation link to sign-in and back", () => {
    const response = proxy(
      request("/invitations/0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c")
    );

    expect(response.headers.get("location")).toBe(
      "https://homesplit.test/sign-in?redirectTo=%2Finvitations%2F0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c"
    );
  });

  it.each(["/privacy", "/terms"])(
    "lets everyone open %s, with a session cookie or without",
    (path) => {
      expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
      expect(
        proxy(request(path, SESSION_COOKIE)).headers.get("x-middleware-next")
      ).toBe("1");
    }
  );

  it("lets visitors without a session cookie open signed-out pages", () => {
    const response = proxy(request("/sign-up"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
