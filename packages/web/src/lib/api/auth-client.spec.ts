import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api-error";
import {
  BLOCKED_AUTH_PATHS,
  BlockedAuthPathError,
  blockDisabledPaths,
  createAuth,
} from "./auth-client";

const BASE_URL = "http://localhost:3000";
const HOUSEHOLD_ID = "0b6f1f4e-3c1a-4b8e-9a59-1d2f3e4a5b6c";
const MEMBER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface SentRequest {
  body: Record<string, unknown> | undefined;
  method: string;
  path: string;
  query: Partial<Record<string, string>>;
}

function setup(respond: () => Response = () => Response.json({})) {
  const sent: SentRequest[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    return request.text().then((text) => {
      sent.push({
        method: request.method,
        path: url.pathname.replace("/api/auth", ""),
        query: Object.fromEntries(url.searchParams),
        body: text ? JSON.parse(text) : undefined,
      });
      return respond();
    });
  });
  return { ...createAuth({ baseURL: BASE_URL, fetch }), fetch, sent };
}

describe("households", () => {
  it("passes the household to every call that takes one", async () => {
    const { households, sent } = setup();
    const householdId = HOUSEHOLD_ID;
    await households.rename({ householdId, name: "Flat" });
    await households.get({ householdId });
    await households.listMembers({ householdId });
    await households.updateMemberRole({
      householdId,
      memberId: MEMBER_ID,
      role: "admin",
    });
    await households.removeMember({ householdId, memberId: MEMBER_ID });
    await households.leave({ householdId });
    await households.invite({
      householdId,
      email: "a@example.com",
      role: "member",
    });
    await households.listInvitations({ householdId });

    expect(sent.map(({ path }) => path)).toEqual([
      "/organization/update",
      "/organization/get-full-organization",
      "/organization/list-members",
      "/organization/update-member-role",
      "/organization/remove-member",
      "/organization/leave",
      "/organization/invite-member",
      "/organization/list-invitations",
    ]);
    for (const { path, query, body } of sent) {
      expect(query.organizationId ?? body?.organizationId, path).toBe(
        HOUSEHOLD_ID
      );
    }
  });

  it("creates households with only a name and a fresh UUID slug", async () => {
    const { households, sent } = setup();
    await households.create({ name: "Flat" });
    await households.create({ name: "Flat" });
    for (const request of sent) {
      expect(request.method).toBe("POST");
      expect(request.path).toBe("/organization/create");
      expect(request.body).toEqual({
        name: "Flat",
        slug: expect.stringMatching(UUID),
      });
    }
    expect(sent[0]?.body?.slug).not.toBe(sent[1]?.body?.slug);
  });

  it("throws Better Auth errors as ApiRequestError from auth", async () => {
    const { households } = setup(() =>
      Response.json(
        {
          code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
          message: "You are not allowed to delete this member",
        },
        { status: 401, statusText: "Unauthorized" }
      )
    );
    const error = await households
      .removeMember({ householdId: HOUSEHOLD_ID, memberId: MEMBER_ID })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      source: "auth",
      status: 401,
      code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
    });
  });

  it("reports a failed fetch as a network error", async () => {
    const { households, fetch } = setup();
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(households.list()).rejects.toMatchObject({
      source: "auth",
      code: "NETWORK_ERROR",
    });
  });
});

describe("blockDisabledPaths", () => {
  it("refuses disabled paths before sending anything", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createAuthClient({
      baseURL: BASE_URL,
      plugins: [organizationClient()],
      fetchOptions: { plugins: [blockDisabledPaths], customFetchImpl: fetch },
    });
    await expect(
      client.organization.setActive({ organizationId: HOUSEHOLD_ID })
    ).rejects.toBeInstanceOf(BlockedAuthPathError);
    await expect(client.organization.getActiveMember()).rejects.toBeInstanceOf(
      BlockedAuthPathError
    );
    await expect(
      client.$fetch("/organization/list-user-invitations")
    ).rejects.toBeInstanceOf(BlockedAuthPathError);
    expect(fetch).not.toHaveBeenCalled();
    expect(BLOCKED_AUTH_PATHS.has("/organization/set-active")).toBe(true);
  });
});

describe("account", () => {
  it("signs up, in, and out with email and password", async () => {
    const { account, sent } = setup(() =>
      Response.json({ token: "t", user: {} })
    );
    await account.signUp({
      name: "Ada",
      email: "ada@example.com",
      password: "correct horse",
    });
    await account.signIn({ email: "ada@example.com", password: "x" });
    await account.signOut();
    expect(sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /sign-up/email",
      "POST /sign-in/email",
      "POST /sign-out",
    ]);
    expect(sent[0]?.body).toEqual({
      name: "Ada",
      email: "ada@example.com",
      password: "correct horse",
    });
  });

  it("changes the password with the current one", async () => {
    const { account, sent } = setup(() =>
      Response.json({ token: null, user: {} })
    );
    await account.changePassword({
      currentPassword: "old password",
      newPassword: "new password",
      revokeOtherSessions: true,
    });
    expect(sent).toEqual([
      {
        method: "POST",
        path: "/change-password",
        query: {},
        body: {
          currentPassword: "old password",
          newPassword: "new password",
          revokeOtherSessions: true,
        },
      },
    ]);
  });

  it("lists and signs out sessions", async () => {
    const { account, sent } = setup(() => Response.json([]));
    expect(await account.listSessions()).toEqual([]);
    await account.revokeSession({ token: "other-token" });
    await account.revokeOtherSessions();
    expect(sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /list-sessions",
      "POST /revoke-session",
      "POST /revoke-other-sessions",
    ]);
    expect(sent[1]?.body).toEqual({ token: "other-token" });
  });

  it("throws a rejected sign-in as ApiRequestError from auth", async () => {
    const { account } = setup(() =>
      Response.json(
        {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
        },
        { status: 401, statusText: "Unauthorized" }
      )
    );
    await expect(
      account.signIn({ email: "ada@example.com", password: "x" })
    ).rejects.toMatchObject({
      source: "auth",
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
  });
});
