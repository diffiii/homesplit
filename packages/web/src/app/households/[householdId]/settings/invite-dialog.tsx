"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form";
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
import { Button } from "@/components/ui/button";
import { type HouseholdRole, households } from "@/lib/api/auth-client";
import { queryKeys } from "@/lib/api/query-keys";
import { applyAuthErrors } from "@/lib/auth-errors";
import type { ServerErrors } from "@/lib/form";
import { INVITATION_DAYS } from "@/lib/invitations";
import { ROLE_LABEL } from "@/lib/roles";

/** Weakest first, so the default is the first one. */
const INVITE_ROLES: readonly HouseholdRole[] = ["member", "admin", "owner"];

const InviteValues = z.object({
  email: z.email("Enter a valid email address."),
  role: z.enum(["member", "admin", "owner"]),
});

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

/** Invite an address with a role the caller may grant. */
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
  const roles = INVITE_ROLES.filter((role) => can.invite(role));
  const invite = useMutation({ mutationFn: households.invite });
  const form = useAppForm({
    defaultValues: { email: "", role: "member" as HouseholdRole },
    validators: { onSubmit: InviteValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        await invite.mutateAsync({ householdId: household.id, ...value });
      } catch (error) {
        applyAuthErrors(formApi, error, INVITE_ERRORS);
        return;
      }
      toast.success(`Invitation sent to ${value.email}.`);
      onOpenChange(false);
      formApi.reset();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.household(household.id),
      });
    },
  });

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        if (invite.isPending) {
          return;
        }
        onOpenChange(next);
        if (!next) {
          form.reset();
        }
      }}
      open={open}
    >
      <ResponsiveDialogContent>
        <form.AppForm>
          <form.Form className="contents">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>Invite someone</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                We'll email them a link to join {household.name}. It works for{" "}
                {INVITATION_DAYS} days, and they can create an account with it.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody className="flex flex-col gap-4">
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
