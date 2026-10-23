import {
  CreateFriendRequest,
  endpoints,
  type FriendRequest,
  type FriendRequestListResponse,
} from "@homesplit/contracts";
import { Body, Controller, Inject, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { ZodPipe } from "@/http/zod.pipe";
import { Route } from "@/route.decorator";
import { FriendRequestsService } from "./friend-requests.service";

@Controller()
export class FriendsController {
  private readonly requests: FriendRequestsService;

  constructor(@Inject(FriendRequestsService) requests: FriendRequestsService) {
    this.requests = requests;
  }

  // Limited per user because the answer reveals whether an email has an account.
  @Route(endpoints.createFriendRequest)
  @UseGuards(ThrottlerGuard)
  createFriendRequest(
    @Session() session: UserSession,
    @Body(new ZodPipe(CreateFriendRequest)) body: CreateFriendRequest
  ): Promise<FriendRequest> {
    return this.requests.create(session.user.id, body.email);
  }

  @Route(endpoints.listIncomingFriendRequests)
  listIncomingFriendRequests(
    @Session() session: UserSession
  ): Promise<FriendRequestListResponse> {
    return this.requests.listIncoming(session.user.id);
  }

  @Route(endpoints.listSentFriendRequests)
  listSentFriendRequests(
    @Session() session: UserSession
  ): Promise<FriendRequestListResponse> {
    return this.requests.listSent(session.user.id);
  }
}
