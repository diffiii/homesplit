"use client";

import type { FriendRequest, Friendship } from "@homesplit/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FriendLabel } from "@/components/friend-label";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { UserMenu } from "@/components/shell/user-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRequiredSession } from "@/hooks/use-required-session";
import { api } from "@/lib/api/client";
import { friendQueries, invalidateFriends } from "@/lib/api/friend-queries";
import { HOME_PATH } from "@/lib/api/session";
import { AddFriendForm, useAcceptRequest } from "./add-friend-form";

type Pending =
  | { kind: "remove"; friendship: Friendship }
  | { kind: "decline" | "withdraw"; request: FriendRequest };

/** Friends, the requests waiting on either side, and sending a new one. */
export default function FriendsPage() {
  useRequiredSession();
  const queryClient = useQueryClient();
  const queries = [
    useQuery(friendQueries.friends()),
    useQuery(friendQueries.incoming()),
    useQuery(friendQueries.sent()),
  ] as const;
  const [friends, incoming, sent] = queries;

  // One dialog for the whole page, since confirming removes the row that
  // opened it. Focus then moves to the page rather than being lost.
  const main = useRef<HTMLElement>(null);
  const done = useRef<boolean>(false);
  const opener = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState<{ open: boolean; action?: Pending }>({
    open: false,
  });
  const ask = (event: MouseEvent<HTMLElement>, action: Pending) => {
    opener.current = event.currentTarget;
    done.current = false;
    setPending({ open: true, action });
  };
  const act = useMutation({
    mutationFn: (action: Pending) => {
      switch (action.kind) {
        case "remove":
          return api("removeFriendship", {
            params: { friendshipId: action.friendship.id },
          });
        case "decline":
          return api("declineFriendRequest", {
            params: { requestId: action.request.id },
          });
        default:
          return api("withdrawFriendRequest", {
            params: { requestId: action.request.id },
          });
      }
    },
    onSettled: () => invalidateFriends(queryClient),
  });

  let content: ReactNode;
  const failed = queries.find(
    (query) => query.status === "error" && query.data === undefined
  );
  if (failed) {
    content = (
      <ErrorState
        error={failed.error}
        onRetry={() =>
          Promise.all(
            queries.filter((query) => query.isError).map((q) => q.refetch())
          )
        }
        retrying={queries.some((query) => query.isRefetching)}
        title="Couldn't load your friends"
      />
    );
  } else if (friends.data && incoming.data && sent.data) {
    content = (
      <>
        {incoming.data.items.length > 0 ? (
          <RequestSection
            heading="Requests for you"
            id="incoming-heading"
            requests={incoming.data.items}
          >
            {(request) => (
              <>
                <Button
                  aria-label={`Decline request from ${request.user.name}`}
                  onClick={(event) => ask(event, { kind: "decline", request })}
                  size="sm"
                  variant="outline"
                >
                  Decline
                </Button>
                <AcceptButton main={main} request={request} />
              </>
            )}
          </RequestSection>
        ) : null}
        <section
          aria-labelledby="friends-heading"
          className="flex flex-col gap-3"
        >
          <h2 className="text-base font-medium" id="friends-heading">
            Your friends
          </h2>
          {friends.data.items.length === 0 ? (
            <EmptyState
              description="Send a request to someone's email. Once they accept, you can invite them to a household without typing it again."
              icon={UsersIcon}
              title="No friends yet"
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {friends.data.items.map((friendship) => (
                <PersonRow key={friendship.id} user={friendship.friend}>
                  <Button
                    aria-label={`Remove ${friendship.friend.name}`}
                    onClick={(event) =>
                      ask(event, { kind: "remove", friendship })
                    }
                    size="sm"
                    variant="outline"
                  >
                    Remove
                  </Button>
                </PersonRow>
              ))}
            </ul>
          )}
        </section>
        {sent.data.items.length > 0 ? (
          <RequestSection
            heading="Sent requests"
            id="sent-heading"
            requests={sent.data.items}
          >
            {(request) => (
              <Button
                aria-label={`Withdraw request to ${request.user.name}`}
                onClick={(event) => ask(event, { kind: "withdraw", request })}
                size="sm"
                variant="outline"
              >
                Withdraw
              </Button>
            )}
          </RequestSection>
        ) : null}
      </>
    );
  } else {
    content = <ListSkeleton label="Loading your friends" rows={3} />;
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between gap-1 px-2">
        <Link className={buttonVariants({ variant: "ghost" })} href={HOME_PATH}>
          <ArrowLeftIcon aria-hidden data-icon="inline-start" />
          Back
        </Link>
        <UserMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-10 outline-none"
        id="main"
        ref={main}
        tabIndex={-1}
      >
        <PageHeader title="Friends" />
        <AddFriendForm main={main} />
        {content}
      </main>
      {pending.action ? (
        <ConfirmDialog
          {...confirmText(pending.action)}
          // The opener's row is gone once the action succeeds, and may be
          // after a failure, when the other person acted first.
          finalFocus={() => {
            if (!done.current && opener.current?.isConnected) {
              return true;
            }
            main.current?.focus();
            return false;
          }}
          onConfirm={async () => {
            await act.mutateAsync(pending.action as Pending);
            done.current = true;
          }}
          onOpenChange={(open) =>
            setPending((current) => ({ ...current, open }))
          }
          open={pending.open}
        />
      ) : null}
    </div>
  );
}

function confirmText(action: Pending) {
  switch (action.kind) {
    case "remove":
      return {
        title: `Remove ${action.friendship.friend.name}?`,
        description:
          "You'll stop being friends. To be friends again, one of you has to send a new request.",
        confirmLabel: "Remove",
        destructive: true,
      };
    case "decline":
      return {
        title: `Decline ${action.request.user.name}'s request?`,
        description: "They can send you a new request later.",
        confirmLabel: "Decline",
      };
    default:
      return {
        title: `Withdraw your request to ${action.request.user.name}?`,
        description: "They won't see it anymore. You can send a new one later.",
        confirmLabel: "Withdraw",
      };
  }
}

function RequestSection({
  heading,
  id,
  requests,
  children,
}: {
  heading: string;
  id: string;
  requests: readonly FriendRequest[];
  children: (request: FriendRequest) => ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id={id}>
        {heading}
      </h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {requests.map((request) => (
          <PersonRow key={request.id} user={request.user}>
            {children(request)}
          </PersonRow>
        ))}
      </ul>
    </section>
  );
}

function PersonRow({
  user,
  children,
}: {
  user: Friendship["friend"];
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
      {/* Wide enough that the buttons wrap below rather than squeeze the email. */}
      <FriendLabel className="min-w-48" user={user} />
      <div className="ml-auto flex gap-2">{children}</div>
    </li>
  );
}

function AcceptButton({
  request,
  main,
}: {
  request: FriendRequest;
  main: RefObject<HTMLElement | null>;
}) {
  const accept = useAcceptRequest(main);
  return (
    <Button
      aria-label={`Accept request from ${request.user.name}`}
      disabled={accept.isPending}
      onClick={(event) =>
        accept.mutate({ request, control: event.currentTarget })
      }
      size="sm"
    >
      {accept.isPending ? <Spinner data-icon="inline-start" /> : null}
      Accept
    </Button>
  );
}
