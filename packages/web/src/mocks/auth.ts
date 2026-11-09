import { DisplayName } from "@homesplit/contracts";
import { type HttpHandler, HttpResponse, http } from "msw";
import { z } from "zod";
import type { HouseholdRole } from "@/lib/api/auth-client";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { INVITATION_DAYS } from "@/lib/invitations";
import { hasUnsettledBalances } from "./api/ledger";
import {
  type MockDb,
  type MockHousehold,
  type MockInvitation,
  type MockMember,
  type MockSession,
  type MockUser,
  now,
} from "./db";
import { MockApiError, validationError } from "./errors";
import { defaultCategories } from "./factories";
import { hasRole, type MockNetwork, simulateLatency } from "./routes";

/** Better Auth answers with `{ code, message }` and its own statuses. */
const authError = (status: number, code: string, message: string) =>
  new MockApiError(status, code, message);

const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

const ERRORS = {
  unauthorized: () => authError(UNAUTHORIZED, "UNAUTHORIZED", "Unauthorized"),
  invalidEmail: () => authError(BAD_REQUEST, "INVALID_EMAIL", "Invalid email"),
  memberNotFound: () =>
    authError(BAD_REQUEST, "MEMBER_NOT_FOUND", "Member not found"),
  organizationNotFound: () =>
    authError(BAD_REQUEST, "ORGANIZATION_NOT_FOUND", "Organization not found"),
  invitationNotFound: () =>
    authError(BAD_REQUEST, "INVITATION_NOT_FOUND", "Invitation not found"),
  onlyOwner: () =>
    authError(
      BAD_REQUEST,
      "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
      "You cannot leave the organization as the only owner"
    ),
  notRecipient: () =>
    authError(
      FORBIDDEN,
      "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
      "You are not the recipient of the invitation"
    ),
};

const SESSION_DAYS = 7;
const HOUR_MS = 3_600_000;

function renderUser(user: MockUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: false,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
  };
}

function renderSession(db: MockDb, userId: string) {
  const user = db.user(userId);
  return {
    session: {
      id: `session-${userId}`,
      token: sessionToken(userId),
      userId,
      expiresAt: sessionExpiry(),
      // Sessions last a week, so this one began recently.
      createdAt: sessionStart(),
      updatedAt: sessionStart(),
      ipAddress: null,
      userAgent: currentUserAgent(),
      activeOrganizationId: null,
    },
    user: renderUser(user),
  };
}

/** The current session belongs to the browser running the mocks. */
const currentUserAgent = () =>
  typeof navigator === "undefined" ? null : navigator.userAgent;

function renderOtherSession(session: MockSession) {
  return { ...session, expiresAt: sessionExpiry(), activeOrganizationId: null };
}

const sessionStart = () => new Date(Date.now() - HOUR_MS).toISOString();

const sessionExpiry = () =>
  new Date(Date.now() + SESSION_DAYS * 24 * HOUR_MS).toISOString();

const sessionToken = (userId: string) => `mock-session-${userId}`;

function renderOrganization(household: MockHousehold) {
  return {
    id: household.id,
    name: household.name,
    slug: household.slug,
    logo: null,
    metadata: null,
    createdAt: household.createdAt,
  };
}

function renderMember(db: MockDb, member: MockMember) {
  const user = db.user(member.userId);
  return {
    id: member.id,
    organizationId: member.householdId,
    userId: member.userId,
    role: member.role,
    createdAt: member.createdAt,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    },
  };
}

function renderInvitation(invitation: MockInvitation) {
  return {
    id: invitation.id,
    organizationId: invitation.householdId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    inviterId: invitation.inviterId,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    teamId: null,
  };
}

interface AuthRequest {
  /** JSON body for `POST`, query parameters for `GET`. */
  input: Record<string, unknown>;
}

const Role = z.enum(["owner", "admin", "member"]);

const text = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  return typeof value === "string" ? value : "";
};

/**
 * The Better Auth endpoints the app calls, with Better Auth's checks, codes,
 * and response shapes (1.7.7), and HomeSplit's hooks on top: no self-removal,
 * no leaving with a balance, and no `/organization/delete`.
 */
export function createAuthHandlers(
  db: MockDb,
  network: () => MockNetwork = () => ({ failure: "none", latency: "none" })
): HttpHandler[] {
  const route = (
    method: "get" | "post",
    path: string,
    resolve: (request: AuthRequest) => unknown
  ) =>
    http[method](`*/api/auth${path}`, async ({ request }) => {
      await simulateLatency(network());
      const input =
        method === "get"
          ? Object.fromEntries(new URL(request.url).searchParams)
          : await request.json().catch(() => ({}));
      try {
        const body = resolve({ input: input as Record<string, unknown> });
        if (method === "post") {
          db.changed();
        }
        return HttpResponse.json(body ?? null);
      } catch (error) {
        if (error instanceof MockApiError) {
          return error.toResponse();
        }
        throw error;
      }
    });

  /** The session user, or 401 as Better Auth's session middleware answers. */
  const sessionUser = () => {
    const userId = db.state.sessionUserId;
    if (!userId) {
      throw ERRORS.unauthorized();
    }
    return db.user(userId);
  };

  /** The caller's membership in the household named by `organizationId`. */
  const callerMember = (input: Record<string, unknown>) => {
    const member = db.member(text(input, "organizationId"), sessionUser().id);
    if (!member) {
      throw ERRORS.memberNotFound();
    }
    return member;
  };

  const revokeOtherSessions = (userId: string) => {
    db.state.otherSessions = db.state.otherSessions.filter(
      (session) => session.userId !== userId
    );
  };

  const ownerCount = (householdId: string) =>
    db.members(householdId).filter(({ role }) => role === "owner").length;

  const pendingInvitation = (input: Record<string, unknown>, key: string) => {
    const invitation = db.state.invitations.find(
      ({ id }) => id === text(input, key)
    );
    if (invitation?.status !== "pending" || invitation.expiresAt < now()) {
      throw ERRORS.invitationNotFound();
    }
    if (invitation.email !== sessionUser().email) {
      throw ERRORS.notRecipient();
    }
    return invitation;
  };

  return [
    route("get", "/get-session", () => {
      const userId = db.state.sessionUserId;
      return userId ? renderSession(db, userId) : null;
    }),

    route("post", "/sign-up/email", ({ input }) => {
      const email = text(input, "email").toLowerCase();
      const password = text(input, "password");
      if (!z.email().safeParse(email).success) {
        throw ERRORS.invalidEmail();
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw authError(
          BAD_REQUEST,
          "PASSWORD_TOO_SHORT",
          "Password too short"
        );
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw authError(BAD_REQUEST, "PASSWORD_TOO_LONG", "Password too long");
      }
      if (db.userByEmail(email)) {
        throw authError(
          422,
          "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
          "User already exists. Use another email."
        );
      }
      // HomeSplit's `user.create.before` hook checks the name.
      const name = DisplayName.safeParse(input.name);
      if (!name.success) {
        throw validationError(
          name.error.issues.map(({ message }) => ({ path: ["name"], message }))
        );
      }
      const user: MockUser = {
        id: crypto.randomUUID(),
        name: name.data,
        email,
        image: null,
        password,
        createdAt: now(),
      };
      db.state.users.push(user);
      db.state.sessionUserId = user.id;
      return { token: sessionToken(user.id), user: renderUser(user) };
    }),

    route("post", "/sign-in/email", ({ input }) => {
      const email = text(input, "email");
      if (!z.email().safeParse(email).success) {
        throw ERRORS.invalidEmail();
      }
      const user = db.userByEmail(email);
      if (!user || user.password !== text(input, "password")) {
        throw authError(
          UNAUTHORIZED,
          "INVALID_EMAIL_OR_PASSWORD",
          "Invalid email or password"
        );
      }
      db.state.sessionUserId = user.id;
      return {
        redirect: false,
        token: sessionToken(user.id),
        user: renderUser(user),
      };
    }),

    route("post", "/sign-out", () => {
      db.state.sessionUserId = null;
      return { success: true };
    }),

    route("post", "/change-password", ({ input }) => {
      const user = sessionUser();
      const newPassword = text(input, "newPassword");
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw authError(
          BAD_REQUEST,
          "PASSWORD_TOO_SHORT",
          "Password too short"
        );
      }
      if (newPassword.length > MAX_PASSWORD_LENGTH) {
        throw authError(BAD_REQUEST, "PASSWORD_TOO_LONG", "Password too long");
      }
      if (user.password !== text(input, "currentPassword")) {
        throw authError(BAD_REQUEST, "INVALID_PASSWORD", "Invalid password");
      }
      user.password = newPassword;
      if (input.revokeOtherSessions === true) {
        revokeOtherSessions(user.id);
      }
      return {
        token:
          input.revokeOtherSessions === true ? sessionToken(user.id) : null,
        user: renderUser(user),
      };
    }),

    route("get", "/list-sessions", () => {
      const userId = sessionUser().id;
      return [
        renderSession(db, userId).session,
        ...db.state.otherSessions
          .filter((session) => session.userId === userId)
          .map(renderOtherSession),
      ];
    }),

    // Better Auth ignores a token that isn't one of the caller's sessions.
    route("post", "/revoke-session", ({ input }) => {
      const userId = sessionUser().id;
      const token = text(input, "token");
      if (token === sessionToken(userId)) {
        db.state.sessionUserId = null;
      }
      db.state.otherSessions = db.state.otherSessions.filter(
        (session) => !(session.token === token && session.userId === userId)
      );
      return { status: true };
    }),

    route("post", "/revoke-other-sessions", () => {
      revokeOtherSessions(sessionUser().id);
      return { status: true };
    }),

    route("get", "/organization/list", () => {
      const userId = sessionUser().id;
      return db.state.households
        .filter(({ id }) => db.member(id, userId))
        .map(renderOrganization);
    }),

    route("post", "/organization/create", ({ input }) => {
      const user = sessionUser();
      const name = text(input, "name");
      if (!name) {
        throw authError(BAD_REQUEST, "VALIDATION_ERROR", "Name is required");
      }
      const time = now();
      const household: MockHousehold = {
        id: crypto.randomUUID(),
        name,
        slug: text(input, "slug") || crypto.randomUUID(),
        createdAt: time,
        features: { expenses: true, chores: true, shopping: true, ai: false },
      };
      const member: MockMember = {
        id: crypto.randomUUID(),
        householdId: household.id,
        userId: user.id,
        role: "owner",
        createdAt: time,
      };
      db.state.households.push(household);
      db.addMember(member);
      db.state.categories.push(...defaultCategories(household.id));
      return {
        ...renderOrganization(household),
        members: [renderMember(db, member)],
      };
    }),

    route("post", "/organization/update", ({ input }) => {
      const member = callerMember(input);
      if (!hasRole(member.role, "admin")) {
        throw authError(
          FORBIDDEN,
          "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
          "You are not allowed to update this organization"
        );
      }
      const data = (input.data ?? {}) as Record<string, unknown>;
      if (Object.keys(data).some((key) => key !== "name")) {
        throw authError(
          BAD_REQUEST,
          "UNSUPPORTED_FIELD",
          "Only the name can change"
        );
      }
      const household = db.household(member.householdId) as MockHousehold;
      if (typeof data.name === "string" && data.name) {
        household.name = data.name;
      }
      return renderOrganization(household);
    }),

    route("get", "/organization/get-full-organization", ({ input }) => {
      const household = db.household(text(input, "organizationId"));
      if (!household) {
        throw ERRORS.organizationNotFound();
      }
      if (!db.member(household.id, sessionUser().id)) {
        throw authError(
          FORBIDDEN,
          "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
          "User is not a member of the organization"
        );
      }
      return {
        ...renderOrganization(household),
        members: db
          .members(household.id)
          .map((member) => renderMember(db, member)),
        invitations: db.state.invitations
          .filter(({ householdId }) => householdId === household.id)
          .map(renderInvitation),
      };
    }),

    route("get", "/organization/list-members", ({ input }) => {
      const householdId = text(input, "organizationId");
      if (!db.member(householdId, sessionUser().id)) {
        throw authError(
          FORBIDDEN,
          "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
          "You are not a member of this organization"
        );
      }
      const members = db
        .members(householdId)
        .map((member) => renderMember(db, member));
      return { members, total: members.length };
    }),

    route("post", "/organization/update-member-role", ({ input }) => {
      const caller = callerMember(input);
      const role = Role.safeParse(input.role);
      if (!role.success) {
        throw authError(BAD_REQUEST, "ROLE_NOT_FOUND", "Role not found");
      }
      const target = db.state.members.find(
        ({ id }) => id === text(input, "memberId")
      );
      if (!target) {
        throw ERRORS.memberNotFound();
      }
      const notAllowed = authError(
        FORBIDDEN,
        "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
        "You are not allowed to update this member"
      );
      const touchesOwner = target.role === "owner" || role.data === "owner";
      if (
        target.householdId !== caller.householdId ||
        (touchesOwner && caller.role !== "owner")
      ) {
        throw notAllowed;
      }
      if (
        target.id === caller.id &&
        caller.role === "owner" &&
        role.data !== "owner" &&
        ownerCount(caller.householdId) <= 1
      ) {
        throw authError(
          BAD_REQUEST,
          "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
          "You cannot leave the organization without an owner"
        );
      }
      if (!hasRole(caller.role, "admin")) {
        throw notAllowed;
      }
      target.role = role.data;
      return renderMember(db, target);
    }),

    route("post", "/organization/remove-member", ({ input }) => {
      const user = sessionUser();
      const householdId = text(input, "organizationId");
      if (!householdId) {
        throw authError(
          BAD_REQUEST,
          "VALIDATION_ERROR",
          "organizationId is required"
        );
      }
      const idOrEmail = text(input, "memberIdOrEmail");
      const target = idOrEmail.includes("@")
        ? db
            .members(householdId)
            .find(
              ({ userId }) => db.user(userId).email === idOrEmail.toLowerCase()
            )
        : db.state.members.find(({ id }) => id === idOrEmail);
      // HomeSplit's hook: members leave instead of removing themselves.
      if (target?.userId === user.id && target.householdId === householdId) {
        throw authError(
          FORBIDDEN,
          "CANNOT_REMOVE_SELF",
          "Leave the household instead"
        );
      }
      const caller = callerMember(input);
      if (!target) {
        throw ERRORS.memberNotFound();
      }
      if (
        target.role === "owner" &&
        (caller.role !== "owner" || ownerCount(householdId) <= 1)
      ) {
        throw ERRORS.onlyOwner();
      }
      if (!hasRole(caller.role, "admin")) {
        throw authError(
          UNAUTHORIZED,
          "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
          "You are not allowed to delete this member"
        );
      }
      if (target.householdId !== householdId) {
        throw ERRORS.memberNotFound();
      }
      db.state.members.splice(db.state.members.indexOf(target), 1);
      const { user: _user, ...member } = renderMember(db, target);
      return { member };
    }),

    route("post", "/organization/leave", ({ input }) => {
      const user = sessionUser();
      const householdId = text(input, "organizationId");
      // HomeSplit's hook runs before Better Auth's own checks.
      if (hasUnsettledBalances(db, householdId, user.id)) {
        throw authError(
          409,
          "UNSETTLED_BALANCE",
          "Settle up before leaving the household"
        );
      }
      const member = callerMember(input);
      if (member.role === "owner" && ownerCount(householdId) <= 1) {
        throw ERRORS.onlyOwner();
      }
      db.state.members.splice(db.state.members.indexOf(member), 1);
      return renderMember(db, member);
    }),

    route("post", "/organization/invite-member", ({ input }) => {
      const email = text(input, "email").toLowerCase();
      if (!z.email().safeParse(email).success) {
        throw ERRORS.invalidEmail();
      }
      const caller = callerMember(input);
      if (!hasRole(caller.role, "admin")) {
        throw authError(
          FORBIDDEN,
          "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
          "You are not allowed to invite users to this organization"
        );
      }
      const role = Role.safeParse(input.role);
      if (!role.success) {
        throw authError(BAD_REQUEST, "ROLE_NOT_FOUND", "Role not found");
      }
      if (role.data === "owner" && caller.role !== "owner") {
        throw authError(
          FORBIDDEN,
          "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
          "You are not allowed to invite a user with this role"
        );
      }
      const invitee = db.userByEmail(email);
      if (invitee && db.member(caller.householdId, invitee.id)) {
        throw authError(
          BAD_REQUEST,
          "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
          "User is already a member of this organization"
        );
      }
      const time = Date.now();
      const expiresAt = new Date(
        time + INVITATION_DAYS * 24 * HOUR_MS
      ).toISOString();
      const pending = db.state.invitations.filter(
        (existing) =>
          existing.householdId === caller.householdId &&
          existing.email === email &&
          existing.status === "pending"
      );
      // `resend` sends the unexpired pending invitation again, for longer.
      const resent = pending.find(
        (existing) => Date.parse(existing.expiresAt) > time
      );
      if (resent && input.resend === true) {
        resent.expiresAt = expiresAt;
        return renderInvitation(resent);
      }
      // Otherwise the new invitation replaces every pending one, as the
      // backend's `cancelPendingInvitationsOnReInvite` and trigger do.
      for (const existing of pending) {
        existing.status = "canceled";
      }
      const invitation: MockInvitation = {
        id: crypto.randomUUID(),
        householdId: caller.householdId,
        email,
        role: role.data as HouseholdRole,
        status: "pending",
        inviterId: caller.userId,
        expiresAt,
        createdAt: new Date(time).toISOString(),
      };
      db.state.invitations.push(invitation);
      return renderInvitation(invitation);
    }),

    route("get", "/organization/list-invitations", ({ input }) => {
      const householdId = text(input, "organizationId");
      if (!db.member(householdId, sessionUser().id)) {
        throw authError(
          FORBIDDEN,
          "FORBIDDEN",
          "You are not a member of this organization"
        );
      }
      return db.state.invitations
        .filter((invitation) => invitation.householdId === householdId)
        .map(renderInvitation);
    }),

    route("post", "/organization/cancel-invitation", ({ input }) => {
      const invitation = db.state.invitations.find(
        ({ id }) => id === text(input, "invitationId")
      );
      if (!invitation) {
        throw ERRORS.invitationNotFound();
      }
      const caller = callerMember({ organizationId: invitation.householdId });
      if (!hasRole(caller.role, "admin")) {
        throw authError(
          FORBIDDEN,
          "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION",
          "You are not allowed to cancel this invitation"
        );
      }
      invitation.status = "canceled";
      return renderInvitation(invitation);
    }),

    route("get", "/organization/get-invitation", ({ input }) => {
      sessionUser();
      const invitation = pendingInvitation(input, "id");
      const household = db.household(invitation.householdId) as MockHousehold;
      return {
        ...renderInvitation(invitation),
        organizationName: household.name,
        organizationSlug: household.slug,
        inviterEmail: db.user(invitation.inviterId).email,
      };
    }),

    route("post", "/organization/accept-invitation", ({ input }) => {
      const user = sessionUser();
      const invitation = pendingInvitation(input, "invitationId");
      invitation.status = "accepted";
      const member: MockMember = {
        id: crypto.randomUUID(),
        householdId: invitation.householdId,
        userId: user.id,
        role: invitation.role,
        createdAt: now(),
      };
      db.addMember(member);
      const { user: _user, ...rendered } = renderMember(db, member);
      return { invitation: renderInvitation(invitation), member: rendered };
    }),

    route("post", "/organization/reject-invitation", ({ input }) => {
      sessionUser();
      const invitation = pendingInvitation(input, "invitationId");
      invitation.status = "rejected";
      return { invitation: renderInvitation(invitation), member: null };
    }),

    // HomeSplit deletes households through `DELETE /api/households/:householdId`.
    route("post", "/organization/delete", () => {
      throw authError(404, "NOT_FOUND", "Not found");
    }),

    http.all("*/api/auth/*", ({ request }) => {
      const { pathname } = new URL(request.url);
      console.error(
        `[mocks] Better Auth ${request.method} ${pathname} has no mock. Add one in src/mocks/auth.ts.`
      );
      return authError(404, "NOT_FOUND", "Not mocked").toResponse();
    }),
  ];
}
