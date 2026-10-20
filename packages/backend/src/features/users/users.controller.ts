import {
  endpoints,
  UpdateProfileRequest,
  type UserSummary,
} from "@homesplit/contracts";
import { Body, Controller, Inject } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { PatchPipe } from "@/http/patch.pipe";
import { Route } from "@/route.decorator";
import { UsersService } from "./users.service";

@Controller()
export class UsersController {
  private readonly users: UsersService;

  constructor(@Inject(UsersService) users: UsersService) {
    this.users = users;
  }

  @Route(endpoints.updateProfile)
  updateProfile(
    @Session() session: UserSession,
    @Body(new PatchPipe(UpdateProfileRequest)) body: UpdateProfileRequest
  ): Promise<UserSummary> {
    return this.users.updateProfile(session.user.id, body);
  }
}
