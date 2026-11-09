"use client";

import {
  type FriendUser,
  HOUSEHOLD_ROLES,
  HouseholdRole as HouseholdRoleSchema,
  INVITATION_EXPIRY_DAYS,
} from "@homesplit/contracts";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { FriendLabel } from "@/components/friend-label";
import { ListSkeleton } from "@/components/list-skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import {
  useHousehold,
  usePermissions,
} from "@/components/shell/household-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isApiRequestError } from "@/lib/api/api-error";
import { type HouseholdRole, households } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import { friendQueries } from "@/lib/api/friend-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { applyAuthErrors } from "@/lib/auth-errors";
import type { ServerErrors } from "@/lib/form";
import { ROLE_LABEL } from "@/lib/roles";

/** The typed address is optional once a friend is picked. */
const inviteValues = (offersFriends: boolean) =>
  z
    .object({
      friends: z.array(z.string()),
      email: z.string(),
      role: HouseholdRoleSchema,
    })
    .superRefine(({ friends, email }, context) => {
      if (
        (email === "" && friends.length > 0) ||
        z.email().safeParse(email).success
      ) {
        return;
      }
      context.addIssue({
        code: "custom",
        path: ["email"],
        message:
          email === "" && offersFriends
            ? "Pick a friend or enter an email address."
            : "Enter a valid email address.",
      });
    });

interface Invitee {
  email: string;
  /** The friend's name, or the address typed in. */
  label: string;
}

interface Outcome extends Invitee {
  error?: unknown;
}

const nameList = new Intl.ListFormat("en", { type: "conjunction" });

function outcomeHeading(outcomes: readonly Outcome[]): string {
  if (outcomes.some(({ error }) => error === undefined)) {
    return "Some invitations weren't sent.";
  }
  return outcomes.length === 1
    ? "The invitation wasn't sent."
    : "The invitations weren't sent.";
}

/** Better Auth's and HomeSplit's answers to an invitation, explained. */
export const INVITE_ERRORS: Partial<Record<string, ServerErrors>> = {
  INVALID_EMAIL: { fields: { email: "Enter a valid email address." } },
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: {
    fields: { email: "They're already a member of this household." },
  },
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: {
    fields: { role: "Only an owner can invite an owner." },
  },
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: {
    fields: {},
    form: "Only admins and owners can invite people.",
  },
  INVITATION_LIMIT_REACHED: {
    fields: {},
    form: "The household has too many pending invitations. Cancel some first.",
  },
  RATE_LIMITED: {
    fields: {},
    form: "Too many invitations were sent from your account or to this address. Try again in an hour.",
  },
};

/** A failed invitation in a sentence. */
export function describeInviteError(error: unknown): string {
  const known = isApiRequestError(error) ? INVITE_ERRORS[error.code] : null;
  return (
    known?.form ?? Object.values(known?.fields ?? {})[0] ?? errorMessage(error)
  );
}

/**
 * Friends who aren't members and have no invitation that's still open. An
 * expired one stays `pending`, and inviting again replaces it. `sent` holds
 * the addresses this dialog has invited, in case the refetch fails.
 */
function useInvitableFriends(open: boolean, sent: readonly string[]) {
  const { household, members } = useHousehold();
  const friends = useQuery({ ...friendQueries.friends(), enabled: open });
  const now = Date.now();
  const taken = new Set([
    ...members.map(({ user }) => user.email.toLowerCase()),
    ...household.invitations
      .filter(
        ({ status, expiresAt }) =>
          status === "pending" && new Date(expiresAt).getTime() > now
      )
      .map(({ email }) => email.toLowerCase()),
    ...sent,
  ]);
  const invitable = (friends.data?.items ?? [])
    .map(({ friend }) => friend)
    .filter(({ email }) => !taken.has(email));
  return { friends, invitable };
}

/** Invite friends or an address with a role the caller may grant. */
export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { household } = useHousehold();
  const can = usePermissions();
  const queryClient = useQueryClient();
  // Weakest first, so the default, `member`, comes first.
  const roles = HOUSEHOLD_ROLES.filter((role) => can.invite(role));
  const [sent, setSent] = useState<string[]>([]);
  const { friends, invitable } = useInvitableFriends(open, sent);
  const [search, setSearch] = useState("");
  const searchId = useId();
  // What went wrong last time, when some invitations weren't sent.
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const invite = useMutation({
    mutationFn: ({
      invitees,
      role,
    }: {
      invitees: Invitee[];
      role: HouseholdRole;
    }) =>
      Promise.all(
        invitees.map(
          async (invitee): Promise<Outcome> =>
            households
              .invite({ householdId: household.id, email: invitee.email, role })
              .then(
                () => invitee,
                (error: unknown) => ({ ...invitee, error })
              )
        )
      ),
  });
  const form = useAppForm({
    defaultValues: {
      friends: [] as string[],
      email: "",
      role: "member" as HouseholdRole,
    },
    // After a failed submit it checks again on every change, so picking a
    // friend clears the message on the email field.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: inviteValues(invitable.length > 0) },
    onSubmit: async ({ value, formApi }) => {
      setOutcomes(null);
      const picked = value.friends.map((email) => ({
        email,
        label:
          invitable.find((friend) => friend.email === email)?.name ?? email,
      }));
      const typed =
        value.email === "" || value.friends.includes(value.email.toLowerCase())
          ? []
          : [{ email: value.email, label: value.email }];
      const invitees = [...picked, ...typed];
      const results = await invite.mutateAsync({ invitees, role: value.role });
      const failed = results.filter((result) => "error" in result);
      const refetchHousehold = () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.household(household.id),
        });

      if (failed.length === 0) {
        toast.success(
          invitees.length === 1
            ? `Invitation sent to ${invitees[0]?.label}.`
            : `Invitations sent to ${nameList.format(invitees.map(({ label }) => label))}.`
        );
        onOpenChange(false);
        formApi.reset();
        setSearch("");
        setSent([]);
        await refetchHousehold();
        return;
      }
      await refetchHousehold();
      // A single address fails as it always has, on its field.
      if (invitees.length === 1 && typed.length === 1) {
        applyAuthErrors(formApi, failed[0]?.error, INVITE_ERRORS);
        return;
      }
      const failedEmails = new Set(
        failed.map(({ email }) => email.toLowerCase())
      );
      formApi.setFieldValue(
        "friends",
        value.friends.filter((email) => failedEmails.has(email))
      );
      // Also when the address was a picked friend's, sent with them.
      if (value.email !== "" && !failedEmails.has(value.email.toLowerCase())) {
        formApi.setFieldValue("email", "");
      }
      setSent((current) => [
        ...current,
        ...results
          .filter((result) => !("error" in result))
          .map(({ email }) => email.toLowerCase()),
      ]);
      setOutcomes(results);
    },
  });
  // Unpick friends who joined or were invited meanwhile, as a refetch shows,
  // so a friend the picker no longer lists isn't invited behind the scenes.
  const invitableEmails = invitable.map(({ email }) => email).join("\n");
  useEffect(() => {
    const allowed = new Set(invitableEmails.split("\n"));
    const picked = form.getFieldValue("friends");
    if (picked.some((email) => !allowed.has(email))) {
      form.setFieldValue(
        "friends",
        picked.filter((email) => allowed.has(email))
      );
    }
  }, [form, invitableEmails]);
  const query = search.trim().toLowerCase();
  const shown = invitable.filter(
    ({ name, email }) =>
      name.toLowerCase().includes(query) || email.includes(query)
  );

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        if (invite.isPending) {
          return;
        }
        onOpenChange(next);
        if (!next) {
          form.reset();
          setSearch("");
          setOutcomes(null);
          setSent([]);
        }
      }}
      open={open}
    >
      {/* The picker and a list of outcomes can outgrow the window; the sheet
          on phones scrolls already. */}
      <ResponsiveDialogContent className="md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto">
        <form.AppForm>
          <form.Form className="contents">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>Invite someone</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                We'll email them a link to join {household.name}. It works for{" "}
                {INVITATION_EXPIRY_DAYS} days, and they can create an account
                with it.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody className="flex flex-col gap-4">
              {friends.status === "pending" && open ? (
                <ListSkeleton label="Loading your friends" rows={2} />
              ) : null}
              {friends.isError && friends.data === undefined ? (
                <Alert>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Couldn't load your friends. You can still invite by email.
                    </span>
                    <Button
                      disabled={friends.isRefetching}
                      onClick={() => friends.refetch()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Try again
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {invitable.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Field>
                    <FieldLabel htmlFor={searchId}>Search friends</FieldLabel>
                    <Input
                      autoComplete="off"
                      id={searchId}
                      onChange={(event) => setSearch(event.target.value)}
                      // Enter searches; it doesn't send the invitations.
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                        }
                      }}
                      type="search"
                      value={search}
                    />
                  </Field>
                  {shown.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto">
                      <form.AppField name="friends">
                        {(field) => (
                          <field.ChecklistField
                            label="Friends"
                            options={shown.map((friend: FriendUser) => ({
                              value: friend.email,
                              label: <FriendLabel user={friend} />,
                            }))}
                          />
                        )}
                      </form.AppField>
                    </div>
                  ) : null}
                  <p
                    aria-live="polite"
                    className="text-muted-foreground text-sm empty:sr-only"
                  >
                    {shown.length === 0
                      ? `No friends match “${search.trim()}”.`
                      : null}
                  </p>
                </div>
              ) : null}
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    autoComplete="off"
                    description="If they already have an invitation, this one replaces it."
                    disabled={invite.isPending}
                    label="Email"
                    type="email"
                  />
                )}
              </form.AppField>
              {roles.length > 1 ? (
                <form.AppField name="role">
                  {(field) => (
                    <field.SelectField
                      description="Admins manage members, modules, and categories. Owners can also manage owners and delete the household."
                      items={roles.map((role) => ({
                        label: ROLE_LABEL[role],
                        value: role,
                      }))}
                      label="Role"
                    />
                  )}
                </form.AppField>
              ) : null}
              {outcomes ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <p>{outcomeHeading(outcomes)}</p>
                    <ul className="mt-1 list-disc pl-5">
                      {outcomes.map(({ email, label, error }) => (
                        <li key={email}>
                          {error === undefined
                            ? `Sent to ${label}.`
                            : `Not sent to ${label}: ${describeInviteError(error)}`}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              <form.FormError />
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose
                render={
                  <Button disabled={invite.isPending} variant="outline" />
                }
              >
                Cancel
              </ResponsiveDialogClose>
              <form.SubmitButton>Send invitation</form.SubmitButton>
            </ResponsiveDialogFooter>
          </form.Form>
        </form.AppForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
