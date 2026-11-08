import { endpoints, Id, type InvitationPreview } from "@homesplit/contracts";
import { Controller, Inject, Param } from "@nestjs/common";
import { ZodPipe } from "@/http/zod.pipe";
import { Route } from "@/route.decorator";
import { InvitationsService } from "./invitations.service";

@Controller()
export class InvitationsController {
  private readonly invitations: InvitationsService;

  constructor(@Inject(InvitationsService) invitations: InvitationsService) {
    this.invitations = invitations;
  }

  // Any signed-in user may look, whatever their email: the page tells someone
  // signed in with another address which one the invitation is for.
  @Route(endpoints.getInvitationPreview)
  getInvitationPreview(
    @Param("invitationId", new ZodPipe(Id)) invitationId: Id
  ): Promise<InvitationPreview> {
    return this.invitations.preview(invitationId);
  }
}
