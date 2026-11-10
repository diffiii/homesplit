"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  EllipsisVerticalIcon,
  MailIcon,
  SendIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useHousehold,
  usePermissions,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isApiRequestError } from "@/lib/api/api-error";
import { type HouseholdRole, households } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import type { HouseholdDetails } from "@/lib/api/household-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatLocalDate } from "@/lib/dates";
import { strongestRole } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/roles";
import { INVITE_ERRORS, InviteDialog } from "./invite-dialog";

type Invitation = HouseholdDetails["invitations"][number];

const CANCEL_ERRORS: Record<string, string> = {
  INVITATION_NOT_FOUND: "This invitation doesn't exist anymore.",
  YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
    "Only admins and owners can cancel invitations.",
};

/** A failed resend or cancellation in a sentence. */
export function describeInvitationError(error: unknown): string {
  if (!isApiRequestError(error)) {
    return errorMessage(error);
  }
  const invite = INVITE_ERRORS[error.code];
  return (
    CANCEL_ERRORS[error.code] ??
    invite?.form ??
    Object.values(invite?.fields ?? {})[0] ??
    errorMessage(error)
  );
}

const isExpired = (invitation: Invitation, now: number) =>
  new Date(invitation.expiresAt).getTime() <= now;

/** Newest first, as each address keeps only its newest one. */
const byNewest = (a: Invitation, b: Invitation) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/**
 * Invitations nobody has answered yet, with their expiry. Admins and owners
 * invite people, send an invitation again, and cancel one; members don't see
 * the section.
 */
export function InvitationSettings() {
  const { household } = useHousehold();
  const can = usePermissions();
  const [inviteOpen, setInviteOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  if (!can.cancelInvitation) {
    return null;
  }
  const pending = household.invitations
    .filter(({ status }) => status === "pending")
    .sort(byNewest);

  return (
    <section
      aria-labelledby="invitations-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            className="text-base font-medium outline-none"
            id="invitations-heading"
            ref={heading}
            tabIndex={-1}
          >
            Invitations
          </h2>
          <p className="text-muted-foreground text-sm">
            People join from the link in their email, after signing in or
            creating an account with the invited address.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} variant="outline">
          <UserPlusIcon aria-hidden data-icon="inline-start" />
          Invite
        </Button>
      </div>
      {pending.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {pending.map((invitation) => (
            <InvitationRow
              invitation={invitation}
              key={invitation.id}
              onFocusLost={() => heading.current?.focus()}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-xl border px-4 py-3 text-sm">
          No pending invitations.
        </p>
      )}
      <InviteDialog onOpenChange={setInviteOpen} open={inviteOpen} />
    </section>
  );
}

function InvitationRow({
  invitation,
  onFocusLost,
}: {
  invitation: Invitation;
  /** Moves focus to the section, for when the row goes away. */
  onFocusLost: () => void;
}) {
  const { household } = useHousehold();
  const can = usePermissions();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const role: HouseholdRole = strongestRole(invitation.role ?? "") ?? "member";
  const { email } = invitation;
  const expired = isExpired(invitation, Date.now());
  const expiry = formatLocalDate(new Date(invitation.expiresAt));

  const refetchHousehold = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.household(household.id),
    });

  // An expired invitation can't be extended, so sending it again replaces it.
  const resend = useMutation({
    mutationFn: () =>
      households.invite({
        householdId: household.id,
        email,
        role,
        resend: true,
      }),
    onSuccess: () => toast.success(`Invitation sent to ${email} again.`),
    onError: (error) => toast.error(describeInvitationError(error)),
    onSettled: refetchHousehold,
  });

  const cancel = async () => {
    try {
      await households.cancelInvitation({ invitationId: invitation.id });
    } finally {
      await refetchHousehold();
    }
    toast.success(`Invitation to ${email} cancelled.`);
    onFocusLost();
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
        <MailIcon aria-hidden className="text-muted-foreground size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium wrap-anywhere">{email}</span>
        <span
          className={
            expired
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {expired ? `Expired ${expiry}` : `Expires ${expiry}`}
        </span>
      </div>
      <Badge className="shrink-0" variant="secondary">
        {ROLE_LABEL[role]}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={resend.isPending}
          render={
            <Button
              aria-label={`Manage invitation for ${email}`}
              size="icon"
              variant="ghost"
            />
          }
        >
          <EllipsisVerticalIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {/* Only an owner may send an owner's invitation again. */}
          {can.invite(role) ? (
            <DropdownMenuItem onClick={() => resend.mutate()}>
              <SendIcon aria-hidden />
              Send again
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => setCancelling(true)}
            variant="destructive"
          >
            <XIcon aria-hidden />
            Cancel invitation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {cancelling ? (
        <ConfirmDialog
          cancelLabel="Keep it"
          confirmLabel="Cancel invitation"
          describeError={describeInvitationError}
          description={`The link in the email to ${email} stops working. You can invite them again later.`}
          destructive
          onConfirm={cancel}
          onOpenChange={(open) => {
            if (!open) {
              setCancelling(false);
            }
          }}
          open
          title={`Cancel the invitation to ${email}?`}
        />
      ) : null}
    </li>
  );
}
