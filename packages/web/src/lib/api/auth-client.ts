import { organizationClient } from "better-auth/client/plugins";
import { type BetterFetchPlugin, createAuthClient } from "better-auth/react";
import { ApiRequestError } from "./api-error";

/**
 * Better Auth paths HomeSplit disables or replaces (docs/decisions.md, "Better
 * Auth endpoints"). The client refuses them before any request is sent.
 */
export const BLOCKED_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/delete-user",
  "/update-user",
  "/organization/check-slug",
  "/organization/delete",
  "/organization/get-active-member",
  "/organization/get-active-member-role",
  "/organization/get-organization",
  "/organization/has-permission",
  "/organization/list-user-invitations",
  "/organization/set-active",
]);

// Better Auth may prefix a path with its method, as in `@post/sign-out`.
const METHOD_PREFIX = /^@\w+\//u;

/** A call to a path in `BLOCKED_AUTH_PATHS`: a bug in the caller, not a failed request. */
export class BlockedAuthPathError extends Error {
  override readonly name = "BlockedAuthPathError";

  constructor(path: string) {
    super(`Better Auth ${path} is disabled in HomeSplit`);
  }
}

export const blockDisabledPaths: BetterFetchPlugin = {
  id: "homesplit-blocked-paths",
  name: "Blocked paths",
  init(url, options) {
    const path = url.replace(METHOD_PREFIX, "/");
    if (BLOCKED_AUTH_PATHS.has(path)) {
      throw new BlockedAuthPathError(path);
    }
    return { url, options };
  },
};

interface AuthErrorBody {
  status: number;
  statusText: string;
}

type AuthResult<T> =
  | { data: T; error: null }
  | { data: null; error: AuthErrorBody };

/** The data of a Better Auth call, or an `ApiRequestError` with source `auth`. */
async function unwrap<T>(call: Promise<AuthResult<T>>): Promise<T> {
  let result: AuthResult<T>;
  try {
    result = await call;
  } catch (error) {
    if (error instanceof BlockedAuthPathError) {
      throw error;
    }
    throw ApiRequestError.network("auth", error);
  }
  if (result.error) {
    throw ApiRequestError.fromBody(
      "auth",
      result.error.status,
      result.error,
      result.error.statusText
    );
  }
  return result.data as T;
}

export type HouseholdRole = "owner" | "admin" | "member";

export interface AuthClientOptions {
  baseURL?: string;
  fetch?: typeof fetch;
}

/**
 * Create the Better Auth client and the household calls built on it. Every
 * household call names its household, so Better Auth never falls back to the
 * session's active organization, which HomeSplit doesn't use.
 */
export function createAuth({ baseURL, fetch }: AuthClientOptions = {}) {
  const client = createAuthClient({
    baseURL,
    plugins: [organizationClient()],
    fetchOptions: {
      plugins: [blockDisabledPaths],
      ...(fetch ? { customFetchImpl: fetch } : {}),
    },
  });
  const { organization } = client;

  const households = {
    /** Households the user is a current member of. */
    list: () => unwrap(organization.list()),

    /** Better Auth needs a unique slug, which HomeSplit never shows, so it's random. */
    create: ({ name }: { name: string }) =>
      unwrap(
        organization.create({
          name,
          slug: crypto.randomUUID(),
        })
      ),

    rename: ({ householdId, name }: { householdId: string; name: string }) =>
      unwrap(
        organization.update({ organizationId: householdId, data: { name } })
      ),

    get: ({ householdId }: { householdId: string }) =>
      unwrap(
        organization.getFullOrganization({
          query: { organizationId: householdId },
        })
      ),

    listMembers: ({ householdId }: { householdId: string }) =>
      unwrap(
        organization.listMembers({ query: { organizationId: householdId } })
      ),

    updateMemberRole: ({
      householdId,
      memberId,
      role,
    }: {
      householdId: string;
      memberId: string;
      role: HouseholdRole;
    }) =>
      unwrap(
        organization.updateMemberRole({
          organizationId: householdId,
          memberId,
          role,
        })
      ),

    removeMember: ({
      householdId,
      memberId,
    }: {
      householdId: string;
      memberId: string;
    }) =>
      unwrap(
        organization.removeMember({
          organizationId: householdId,
          memberIdOrEmail: memberId,
        })
      ),

    leave: ({ householdId }: { householdId: string }) =>
      unwrap(organization.leave({ organizationId: householdId })),

    /**
     * Emails an invitation. A newer one replaces the address's pending
     * invitation; with `resend`, the pending one is sent again instead, with
     * its expiry extended. An expired one is replaced either way.
     */
    invite: ({
      householdId,
      email,
      role,
      resend = false,
    }: {
      householdId: string;
      email: string;
      role: HouseholdRole;
      resend?: boolean;
    }) =>
      unwrap(
        organization.inviteMember({
          organizationId: householdId,
          email,
          role,
          resend,
        })
      ),

    listInvitations: ({ householdId }: { householdId: string }) =>
      unwrap(
        organization.listInvitations({
          query: { organizationId: householdId },
        })
      ),

    cancelInvitation: ({ invitationId }: { invitationId: string }) =>
      unwrap(organization.cancelInvitation({ invitationId })),

    getInvitation: ({ invitationId }: { invitationId: string }) =>
      unwrap(organization.getInvitation({ query: { id: invitationId } })),

    acceptInvitation: ({ invitationId }: { invitationId: string }) =>
      unwrap(organization.acceptInvitation({ invitationId })),

    rejectInvitation: ({ invitationId }: { invitationId: string }) =>
      unwrap(organization.rejectInvitation({ invitationId })),
  };

  /** Email-and-password accounts. Signing in or up sets the session cookie. */
  const account = {
    /**
     * Gives no session (`token: null`) while the email is unverified; Better
     * Auth emails a link that verifies it, signs the user in, and goes to
     * `callbackURL`. A taken email gets the same answer, and no email.
     */
    signUp: (body: {
      name: string;
      email: string;
      password: string;
      callbackURL?: string;
    }) => unwrap(client.signUp.email(body)),

    /**
     * An unverified email answers 403 `EMAIL_NOT_VERIFIED`, after Better Auth
     * emails a new link that goes to `callbackURL` once opened.
     */
    signIn: (body: { email: string; password: string; callbackURL?: string }) =>
      unwrap(client.signIn.email(body)),

    signOut: () => unwrap(client.signOut()),

    /**
     * Needs the current password. With `revokeOtherSessions`, Better Auth
     * deletes every session and signs this device in again with a new one.
     */
    changePassword: (body: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions: boolean;
    }) => unwrap(client.changePassword(body)),

    /**
     * The user's unexpired sessions, the current one included. Each carries
     * its token, which `revokeSession` takes; never show or log it.
     */
    listSessions: async () => (await unwrap(client.listSessions())) ?? [],

    /** Sign out the session with `token`; Better Auth ignores other users' tokens. */
    revokeSession: ({ token }: { token: string }) =>
      unwrap(client.revokeSession({ token })),

    /** Sign out every session but the current one. */
    revokeOtherSessions: () => unwrap(client.revokeOtherSessions()),
  };

  return {
    account,
    households,
    getSession: client.getSession,
    useSession: client.useSession,
  };
}

/**
 * Better Auth on the frontend origin, reached through the `/api/*` rewrite.
 * Organization calls go through `households`; the raw client isn't exported,
 * so nothing can call its `useActiveOrganization`-style hooks, which read the
 * session's active organization.
 */
export const { account, households, getSession, useSession } = createAuth();
