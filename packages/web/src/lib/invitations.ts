/** The page an invitation email links to. */
export function invitationPath(invitationId: string): string {
  return `/invitations/${encodeURIComponent(invitationId)}`;
}
