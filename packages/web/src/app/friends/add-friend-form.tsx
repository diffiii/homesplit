"use client";

import { CreateFriendRequest, type FriendRequest } from "@homesplit/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { friendQueries, invalidateFriends } from "@/lib/api/friend-queries";
import {
  applyServerErrors,
  type ServerErrors,
  showServerErrors,
} from "@/lib/form";

const INCOMING_EXISTS = "INCOMING_FRIEND_REQUEST_EXISTS";

/** The backend's answers to a friend request, explained (docs/api/users-friends.md). */
const SEND_ERRORS: Partial<Record<string, ServerErrors>> = {
  USER_NOT_FOUND: {
    fields: { email: "Nobody has a HomeSplit account with this email." },
  },
  SELF_FRIEND_REQUEST: { fields: { email: "That's your own email." } },
  FRIEND_REQUEST_EXISTS: {
    fields: { email: "You've already sent them a request." },
  },
  ALREADY_FRIENDS: { fields: { email: "You're already friends." } },
  [INCOMING_EXISTS]: {
    fields: { email: "They've already sent you a request." },
  },
  RATE_LIMITED: {
    fields: {},
    form: "You've sent too many friend requests. Try again in an hour.",
  },
};

/** Moves focus to `main` when it was on `control`, which an action just removed. */
function focusIfLost(
  control: HTMLElement,
  main: RefObject<HTMLElement | null>
): void {
  const active = document.activeElement;
  if (active === control || active === document.body || active === null) {
    main.current?.focus();
  }
}

/**
 * Accepts a request and refetches the lists, saying how it went in a toast.
 * Once the request is gone, even after a failure because the requester
 * withdrew it, focus moves from `control` to `main`. That runs here rather
 * than in `mutate`'s callbacks, which don't run once the row has unmounted.
 */
export function useAcceptRequest(main: RefObject<HTMLElement | null>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      request,
    }: {
      request: FriendRequest;
      control: HTMLElement;
    }) => api("acceptFriendRequest", { params: { requestId: request.id } }),
    onSuccess: (friendship) => {
      toast.success(`You and ${friendship.friend.name} are now friends.`);
    },
    onError: (error) => {
      toast.error(
        isApiRequestError(error) && error.code === "ALREADY_FRIENDS"
          ? "You're already friends."
          : errorMessage(error)
      );
    },
    onSettled: async (_data, _error, { request, control }) => {
      await invalidateFriends(queryClient);
      const listed = queryClient
        .getQueryData(friendQueries.incoming().queryKey)
        ?.items.some(({ id }) => id === request.id);
      if (!listed) {
        focusIfLost(control, main);
      }
    },
  });
}

/** Sends a friend request by email, offering to accept theirs if they were first. */
export function AddFriendForm({
  main,
}: {
  main: RefObject<HTMLElement | null>;
}) {
  const queryClient = useQueryClient();
  const accept = useAcceptRequest(main);
  // The crossed request is read from the incoming list, so the offer goes
  // once the request is answered or withdrawn, here, in its row, or elsewhere.
  const incoming = useQuery(friendQueries.incoming());
  const [crossedId, setCrossedId] = useState<string | null>(null);
  const crossed =
    incoming.data?.items.find(({ id }) => id === crossedId) ?? null;
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: CreateFriendRequest },
    onSubmit: async ({ value, formApi }) => {
      setCrossedId(null);
      try {
        const request = await api("createFriendRequest", { body: value });
        toast.success(`Friend request sent to ${request.user.name}.`);
        formApi.reset();
      } catch (error) {
        const known = isApiRequestError(error)
          ? SEND_ERRORS[error.code]
          : undefined;
        if (known) {
          showServerErrors(formApi, known);
        } else {
          applyServerErrors(formApi, error);
        }
        if (isApiRequestError(error) && error.code === INCOMING_EXISTS) {
          await invalidateFriends(queryClient);
          const email = value.email.trim().toLowerCase();
          setCrossedId(
            queryClient
              .getQueryData(friendQueries.incoming().queryKey)
              ?.items.find((request) => request.user.email === email)?.id ??
              null
          );
          return;
        }
      }
      await invalidateFriends(queryClient);
    },
  });

  // Nor is it true anymore that they sent one.
  const gone = crossedId !== null && incoming.data !== undefined && !crossed;
  useEffect(() => {
    if (gone) {
      setCrossedId(null);
      form.setFieldMeta("email", (meta) => ({
        ...meta,
        errorMap: { ...meta.errorMap, onServer: undefined },
      }));
    }
  }, [form, gone]);

  return (
    <section
      aria-labelledby="add-friend-heading"
      className="flex flex-col gap-3"
    >
      <h2 className="text-base font-medium" id="add-friend-heading">
        Add a friend
      </h2>
      <form.AppForm>
        <form.Form className="flex flex-col gap-3">
          <form.AppField
            listeners={{ onChange: () => setCrossedId(null) }}
            name="email"
          >
            {(field) => (
              <field.TextField
                autoComplete="off"
                description="They need a HomeSplit account with this email."
                label="Email"
                type="email"
              />
            )}
          </form.AppField>
          {crossed ? (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>Accept {crossed.user.name}'s request instead?</span>
                <Button
                  disabled={accept.isPending}
                  onClick={(event) =>
                    accept.mutate(
                      { request: crossed, control: event.currentTarget },
                      { onSuccess: () => form.reset() }
                    )
                  }
                  size="sm"
                  type="button"
                >
                  {accept.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Accept request
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <form.FormError />
          <form.SubmitButton className="self-start">
            Send request
          </form.SubmitButton>
        </form.Form>
      </form.AppForm>
    </section>
  );
}
