import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { FriendRequestsService } from "./friend-requests.service";
import { FriendsController } from "./friends.controller";

/** Friend requests a user may send per hour, counting rejected attempts. */
export const FRIEND_REQUEST_LIMIT = 20;

@Module({
  imports: [
    // In-process counters, keyed by user. The global AuthGuard runs first,
    // so the session is always set.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60 * 60 * 1000, limit: FRIEND_REQUEST_LIMIT }],
      getTracker: (req) => (req as { session: UserSession }).session.user.id,
    }),
  ],
  controllers: [FriendsController],
  providers: [FriendRequestsService],
})
export class FriendsModule {}
