import {
  CreateFriendRequest,
  endpoints,
  type FriendRequest,
  type FriendRequestListResponse,
  type Friendship,
  type FriendshipListResponse,
  Id,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { ZodPipe } from "@/http/zod.pipe";
import { Route } from "@/route.decorator";
import { FriendRequestsService } from "./friend-requests.service";
import { FriendshipsService } from "./friendships.service";

@Controller()
export class FriendsController {
  private readonly requests: FriendRequestsService;
  private readonly friendships: FriendshipsService;

  constructor(
    @Inject(FriendRequestsService) requests: FriendRequestsService,
    @Inject(FriendshipsService) friendships: FriendshipsService
  ) {
    this.requests = requests;
    this.friendships = friendships;
  }

  @Route(endpoints.listFriendships)
  listFriendships(
    @Session() session: UserSession
  ): Promise<FriendshipListResponse> {
    return this.friendships.list(session.user.id);
  }

  @Route(endpoints.removeFriendship)
  async removeFriendship(
    @Session() session: UserSession,
    @Param("friendshipId", new ZodPipe(Id)) friendshipId: Id
  ): Promise<void> {
    await this.friendships.remove(session.user.id, friendshipId);
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

  @Route(endpoints.acceptFriendRequest)
  acceptFriendRequest(
    @Session() session: UserSession,
    @Param("requestId", new ZodPipe(Id)) requestId: Id
  ): Promise<Friendship> {
    return this.requests.accept(session.user.id, requestId);
  }

  @Route(endpoints.declineFriendRequest)
  async declineFriendRequest(
    @Session() session: UserSession,
    @Param("requestId", new ZodPipe(Id)) requestId: Id
  ): Promise<void> {
    await this.requests.decline(session.user.id, requestId);
  }

  @Route(endpoints.withdrawFriendRequest)
  async withdrawFriendRequest(
    @Session() session: UserSession,
    @Param("requestId", new ZodPipe(Id)) requestId: Id
  ): Promise<void> {
    await this.requests.withdraw(session.user.id, requestId);
  }
}
