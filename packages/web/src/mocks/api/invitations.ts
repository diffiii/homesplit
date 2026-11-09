import { now } from "../db";
import { notFound } from "../errors";
import type { MockRoutes } from "../routes";

/** `jan@gmail.com` as `j•••@gmail.com`, as the backend masks it. */
const maskEmail = (email: string) => {
  const at = email.lastIndexOf("@");
  return at < 1 ? "•••" : `${email.slice(0, 1)}•••${email.slice(at)}`;
};

export const invitationRoutes: MockRoutes = {
  getInvitationPreview: {
    resolve: ({ db, params }) => {
      const invitation = db.state.invitations.find(
        ({ id }) => id === params.invitationId
      );
      const household = invitation && db.household(invitation.householdId);
      if (!(invitation && household)) {
        throw notFound();
      }
      // Better Auth refuses a pending invitation once it has expired.
      const expired =
        invitation.status === "pending" && invitation.expiresAt < now();
      const status = expired ? "expired" : invitation.status;
      // Like the backend: anyone but the invitee sees the address masked, and
      // the household and inviter only while the invitation is pending.
      const viewerEmail = db.state.sessionUserId
        ? db.user(db.state.sessionUserId).email
        : "";
      const invitee =
        viewerEmail.toLowerCase() === invitation.email.toLowerCase();
      const details = invitee || status === "pending";
      return {
        id: invitation.id,
        household: details ? { id: household.id, name: household.name } : null,
        inviter: details ? db.summary(invitation.inviterId) : null,
        email: invitee ? invitation.email : maskEmail(invitation.email),
        role: invitation.role,
        status,
        expiresAt: invitation.expiresAt,
      };
    },
  },
};
