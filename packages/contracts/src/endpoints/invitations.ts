import { InvitationIdParams, InvitationPreview } from "../features/households";
import type { Endpoint } from "./endpoint";
import { INVITATION } from "./paths";

export const invitationEndpoints = {
  /**
   * Any signed-in user with the invitation's ID, which only its email links
   * to; anyone but the invitee gets less (see `InvitationPreview`). Answers
   * 404 for an unknown ID.
   */
  getInvitationPreview: {
    method: "GET",
    path: INVITATION,
    params: InvitationIdParams,
    status: 200,
    response: InvitationPreview,
  },
} as const satisfies Record<string, Endpoint>;
