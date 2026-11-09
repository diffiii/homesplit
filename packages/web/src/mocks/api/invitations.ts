import { now } from "../db";
import { notFound } from "../errors";
import type { MockRoutes } from "../routes";

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
      return {
        id: invitation.id,
        household: { id: household.id, name: household.name },
        inviter: db.summary(invitation.inviterId),
        email: invitation.email,
        role: invitation.role,
        status: expired ? "expired" : invitation.status,
        expiresAt: invitation.expiresAt,
      };
    },
  },
};
