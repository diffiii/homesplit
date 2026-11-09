import { queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import { queryKeys } from "./query-keys";

/**
 * The invitation page's view of an invitation: household, inviter, address,
 * role, and status, for any signed-in user (docs/api/households.md).
 */
export const invitationQuery = (invitationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitation(invitationId),
    queryFn: ({ signal }) =>
      api("getInvitationPreview", { params: { invitationId }, signal }),
  });
