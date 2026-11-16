"use client";

import {
  type HouseholdSummary,
  INVITATION_EXPIRY_DAYS,
  type InvitationPreview,
  type UserSummary,
} from "@homesplit/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  HourglassIcon,
  MailXIcon,
  UserRoundXIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { NotFoundPage } from "@/components/not-found-page";
import { householdPath } from "@/components/shell/household-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeMenu } from "@/components/theme-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/user-avatar";
import { useRequiredSession } from "@/hooks/use-required-session";
import { isApiRequestError } from "@/lib/api/api-error";
import { households } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import { invitationQuery } from "@/lib/api/invitation-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatLocalDate } from "@/lib/dates";
import { invitationPath } from "@/lib/invitations";
import { HOUSEHOLDS_PATH, rememberHousehold } from "@/lib/last-household";
import { WITH_ARTICLE } from "@/lib/roles";
import { signOutAndReset } from "@/lib/sign-out";

/** Better Auth's answers to accepting or declining, explained. */
const ANSWER_ERRORS: Record<string, string> = {
  INVITATION_NOT_FOUND: "This invitation can't be answered anymore.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    "This invitation is for another address.",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
    "The household has reached its member limit.",
};

export function describeAnswerError(error: unknown): string {
  return (
    (isApiRequestError(error) ? ANSWER_ERRORS[error.code] : undefined) ??
    errorMessage(error)
  );
}

/** Unknown links, and links whose household is gone, are simply not found. */
const isNotFound = (error: unknown) =>
  isApiRequestError(error) && (error.status === 404 || error.status === 400);

const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

/**
 * The invitation an email links to: who invited the user to which household,
 * with buttons to join or decline, or why it can't be answered.
 */
export function InvitationView({ invitationId }: { invitationId: string }) {
  const session = useRequiredSession();
  const invitation = useQuery(invitationQuery(invitationId));

  if (invitation.isError && isNotFound(invitation.error)) {
    return (
      <NotFoundPage
        description="The link may be mistyped, or the household may have been deleted."
        title="Invitation not found"
      />
    );
  }

  const email = session.data?.user.email;
  let content: ReactNode;
  // Data first, so a failed refetch keeps showing what was loaded.
  if (invitation.data && email) {
    content = (
      <InvitationContent invitation={invitation.data} signedInAs={email} />
    );
  } else if (invitation.isError) {
    content = (
      <ErrorState
        error={invitation.error}
        onRetry={invitation.refetch}
        retrying={invitation.isRefetching}
        title="Couldn't load the invitation"
      />
    );
  } else {
    content = <Spinner className="text-muted-foreground size-6" />;
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-end gap-1 px-2">
        <ThemeMenu />
        <UserMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 pb-24 text-center"
        id="main"
      >
        {content}
      </main>
    </div>
  );
}

function InvitationContent({
  invitation,
  signedInAs,
}: {
  invitation: InvitationPreview;
  signedInAs: string;
}) {
  const { household, inviter, status } = invitation;
  // Only the invitee learns how it went. Anyone else, whatever the status, is
  // told which account to use; the API gives them a masked address, and no
  // household or inviter once the invitation isn't pending.
  if (!(sameAddress(invitation.email, signedInAs) && household && inviter)) {
    return <OtherAddress invitation={invitation} signedInAs={signedInAs} />;
  }

  switch (status) {
    case "accepted":
      return (
        <Outcome
          action={
            <Link
              className={buttonVariants()}
              href={householdPath(household.id)}
            >
              Open {household.name}
            </Link>
          }
          description={`You've joined ${household.name}.`}
          icon={<CircleCheckIcon aria-hidden />}
          title="This invitation has been accepted"
        />
      );
    case "rejected":
      return (
        <Outcome
          description={`You declined it. Ask ${inviter.name} to invite you again if you'd like to join ${household.name}.`}
          icon={<MailXIcon aria-hidden />}
          title="This invitation was declined"
        />
      );
    case "canceled":
      return (
        <Outcome
          description={`${inviter.name} cancelled it or sent a newer one. Look for a newer email, or ask them to invite you again.`}
          icon={<MailXIcon aria-hidden />}
          title="This invitation was cancelled"
        />
      );
    case "expired":
      return (
        <Outcome
          description={`Invitations work for ${INVITATION_EXPIRY_DAYS} days. Ask ${inviter.name} to send it again.`}
          icon={<HourglassIcon aria-hidden />}
          title="This invitation has expired"
        />
      );
    default:
      return (
        <PendingInvitation
          household={household}
          invitation={invitation}
          inviter={inviter}
        />
      );
  }
}

/** Why the invitation can't be answered, with the way back to the households. */
function Outcome({
  icon,
  title,
  description,
  action,
}: {
  action?: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <>
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full [&_svg]:size-6">
        {icon}
      </span>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-muted-foreground text-sm">{description}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {action}
        <Link
          className={buttonVariants({
            variant: action ? "outline" : "default",
          })}
          href={HOUSEHOLDS_PATH}
        >
          Your households
        </Link>
      </div>
    </>
  );
}

function OtherAddress({
  invitation,
  signedInAs,
}: {
  invitation: InvitationPreview;
  signedInAs: string;
}) {
  const [switching, setSwitching] = useState(false);
  const { email, household, inviter } = invitation;
  return (
    <>
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full [&_svg]:size-6">
        <UserRoundXIcon aria-hidden />
      </span>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        This invitation is for another address
      </h1>
      <p className="text-muted-foreground text-sm">
        {inviter && household ? (
          <>
            {inviter.name} invited{" "}
            <strong className="text-foreground wrap-anywhere">{email}</strong>{" "}
            to {household.name}
          </>
        ) : (
          <>
            It was sent to{" "}
            <strong className="text-foreground wrap-anywhere">{email}</strong>
          </>
        )}
        , and you're signed in as{" "}
        <strong className="text-foreground wrap-anywhere">{signedInAs}</strong>.
        Sign in with the invited address to see it, or create an account with
        it.
      </p>
      <Button
        className="mt-2"
        disabled={switching}
        onClick={async () => {
          setSwitching(true);
          await signOutAndReset({ redirectTo: invitationPath(invitation.id) });
          setSwitching(false);
        }}
      >
        {switching ? <Spinner data-icon="inline-start" /> : null}
        Switch account
      </Button>
    </>
  );
}

function PendingInvitation({
  invitation,
  household,
  inviter,
}: {
  household: HouseholdSummary;
  invitation: InvitationPreview;
  inviter: UserSummary;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState(false);
  // A failed answer may mean the invitation changed, so it's read again.
  const refetchInvitation = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.invitation(invitation.id),
    });

  const accept = useMutation({
    mutationFn: () =>
      households.acceptInvitation({ invitationId: invitation.id }),
    onSuccess: async () => {
      // Going back to this page shouldn't offer to join again.
      queryClient.setQueryData(
        queryKeys.invitation(invitation.id),
        (cached: InvitationPreview | undefined) =>
          cached && { ...cached, status: "accepted" as const }
      );
      rememberHousehold(household.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.households() });
      toast.success(`You joined ${household.name}.`);
      router.push(householdPath(household.id));
    },
    onError: refetchInvitation,
  });

  const decline = async () => {
    try {
      await households.rejectInvitation({ invitationId: invitation.id });
    } finally {
      await refetchInvitation();
    }
    toast.success("Invitation declined.");
  };

  return (
    <>
      <UserAvatar
        decorative
        size="lg"
        user={{ name: inviter.name, imageUrl: inviter.imageUrl }}
      />
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Join {household.name}
      </h1>
      <p className="text-muted-foreground text-sm">
        {inviter.name} invited you to join as {WITH_ARTICLE[invitation.role]}.
        The invitation works until{" "}
        {formatLocalDate(new Date(invitation.expiresAt))}.
      </p>
      <div className="mt-2 flex w-full flex-col gap-2">
        <Button
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
          size="lg"
        >
          {accept.isPending ? <Spinner data-icon="inline-start" /> : null}
          Join household
        </Button>
        <Button
          disabled={accept.isPending}
          onClick={() => setDeclining(true)}
          size="lg"
          variant="outline"
        >
          Decline
        </Button>
      </div>
      {accept.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {describeAnswerError(accept.error)}
        </p>
      ) : null}
      {declining ? (
        <ConfirmDialog
          confirmLabel="Decline"
          describeError={describeAnswerError}
          description={`You won't join ${household.name}. ${inviter.name} can invite you again.`}
          onConfirm={decline}
          onOpenChange={(open) => {
            if (!open) {
              setDeclining(false);
            }
          }}
          open
          title="Decline the invitation?"
        />
      ) : null}
    </>
  );
}
