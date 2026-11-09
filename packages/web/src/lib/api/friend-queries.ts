import { type QueryClient, useQuery } from "@tanstack/react-query";
import { endpointQuery, invalidate } from "./queries";
import { queryKeys } from "./query-keys";

export const friendQueries = {
  friends: () => endpointQuery("listFriendships"),
  incoming: () => endpointQuery("listIncomingFriendRequests"),
  sent: () => endpointQuery("listSentFriendRequests"),
};

/** Refetch the friend list and both request lists, which every friend action may change. */
export function invalidateFriends(client: QueryClient): Promise<void> {
  return invalidate(client, [
    queryKeys.endpoint("listFriendships"),
    queryKeys.endpoint("listIncomingFriendRequests"),
    queryKeys.endpoint("listSentFriendRequests"),
  ]);
}

/** Friend requests waiting for the user's answer, which the navigation counts. */
export function useIncomingFriendRequestCount(): number {
  const { data } = useQuery(friendQueries.incoming());
  return data?.items.length ?? 0;
}

/** "1 friend request", "2 friend requests", for the count in the navigation. */
export function describeRequestCount(count: number): string {
  return count === 1 ? "1 friend request" : `${count} friend requests`;
}
