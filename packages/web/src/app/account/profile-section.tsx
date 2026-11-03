"use client";

import type { UserSummary } from "@homesplit/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/form";
import { AvatarField } from "./avatar-field";

const ProfileValues = z.object({
  // The limits of `DisplayName`, which `PATCH /api/me` checks.
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Use at most 100 characters."),
});

interface ProfileSectionProps {
  /** Refetch the session, whose user the page and the account menu show. */
  onChanged: () => Promise<unknown>;
  user: Pick<UserSummary, "name" | "imageUrl"> & { email: string };
}

/** The avatar, or initials without one, and the display name. */
export function ProfileSection({ user, onChanged }: ProfileSectionProps) {
  const queryClient = useQueryClient();
  // Members, payers, assignees, and friends embed the user's `UserSummary`
  // in queries of every household, so all of them refetch.
  const refresh = () =>
    Promise.all([onChanged(), queryClient.invalidateQueries()]);
  const form = useAppForm({
    defaultValues: { name: user.name },
    validators: { onSubmit: ProfileValues },
    onSubmit: async ({ value, formApi }) => {
      let saved: UserSummary;
      try {
        saved = await api("updateProfile", {
          body: { name: value.name.trim() },
        });
      } catch (error) {
        applyServerErrors(formApi, error);
        return;
      }
      formApi.reset({ name: saved.name });
      toast.success("Name saved.");
      await refresh();
    },
  });

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
      <h2 className="text-base font-medium" id="profile-heading">
        Profile
      </h2>
      <div className="flex items-center gap-4">
        <AvatarField onChanged={refresh} user={user} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{user.name}</span>
          <span className="text-muted-foreground truncate text-sm">
            {user.email}
          </span>
        </div>
      </div>
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                autoComplete="name"
                description="Shown to the people in your households."
                label="Name"
              />
            )}
          </form.AppField>
          <form.FormError />
          <div>
            <form.SubmitButton>Save name</form.SubmitButton>
          </div>
        </form.Form>
      </form.AppForm>
    </section>
  );
}
