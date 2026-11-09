/**
 * How long an invitation link works, the backend's `invitationExpiresIn`
 * (docs/decisions.md, "Better Auth endpoints").
 */
export const INVITATION_DAYS = 7;

/** The page an invitation email links to. */
export function invitationPath(invitationId: string): string {
  return `/invitations/${encodeURIComponent(invitationId)}`;
}
