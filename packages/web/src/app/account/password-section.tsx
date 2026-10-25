"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { account } from "@/lib/api/auth-client";
import { queryKeys } from "@/lib/api/query-keys";
import {
  applyAuthErrors,
  CHANGE_PASSWORD_ERRORS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth-errors";

const PasswordValues = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`),
  revokeOtherSessions: z.boolean(),
});

interface PasswordSectionProps {
  /** Refetch the session, which signing out other devices replaces. */
  onChanged: () => Promise<unknown>;
}

/** Change the password, optionally signing out every other device. */
export function PasswordSection({ onChanged }: PasswordSectionProps) {
  const queryClient = useQueryClient();
  const form = useAppForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      revokeOtherSessions: true,
    },
    validators: { onSubmit: PasswordValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        await account.changePassword(value);
      } catch (error) {
        applyAuthErrors(formApi, error, CHANGE_PASSWORD_ERRORS);
        return;
      }
      formApi.reset();
      toast.success(
        value.revokeOtherSessions
          ? "Password changed. Your other devices are signed out."
          : "Password changed."
      );
      if (value.revokeOtherSessions) {
        // The current session comes back with a new ID, and the others are gone.
        await onChanged();
        await queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(),
        });
      }
    },
  });

  return (
    <section aria-labelledby="password-heading" className="flex flex-col gap-4">
      <h2 className="font-medium text-base" id="password-heading">
        Password
      </h2>
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="currentPassword">
            {(field) => (
              <field.TextField
                autoComplete="current-password"
                label="Current password"
                type="password"
              />
            )}
          </form.AppField>
          <form.AppField name="newPassword">
            {(field) => (
              <field.TextField
                autoComplete="new-password"
                description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                label="New password"
                type="password"
              />
            )}
          </form.AppField>
          <form.AppField name="revokeOtherSessions">
            {(field) => (
              <field.CheckboxField
                description="Anyone signed in elsewhere has to sign in again with the new password."
                label="Sign out of other devices"
              />
            )}
          </form.AppField>
          <form.FormError />
          <div>
            <form.SubmitButton>Change password</form.SubmitButton>
          </div>
        </form.Form>
      </form.AppForm>
    </section>
  );
}
