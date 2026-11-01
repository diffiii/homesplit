"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import {
  useHousehold,
  usePermissions,
} from "@/components/shell/household-context";
import { households } from "@/lib/api/auth-client";
import { householdQueries } from "@/lib/api/household-queries";
import { applyServerErrors } from "@/lib/form";

const HouseholdNameValues = z.object({
  // Better Auth requires a nonempty name, with no maximum length.
  name: z.string().trim().min(1, "Give the household a name."),
});

/** Admins and owners rename the household; members see the name in the switcher. */
export function HouseholdNameSettings() {
  const { household } = useHousehold();
  const can = usePermissions();
  if (!can.renameHousehold) {
    return null;
  }
  // A fresh form per household, so switching households doesn't keep the old name.
  return <HouseholdNameForm key={household.id} />;
}

function HouseholdNameForm() {
  const { household } = useHousehold();
  const queryClient = useQueryClient();
  const form = useAppForm({
    defaultValues: { name: household.name },
    validators: { onSubmit: HouseholdNameValues },
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim();
      try {
        // Only the name: the slug, logo, and metadata aren't HomeSplit's to change.
        await households.rename({ householdId: household.id, name });
      } catch (error) {
        applyServerErrors(formApi, error);
        return;
      }
      formApi.reset({ name });
      toast.success("Household renamed.");
      // The switcher reads the list, and the shell the household.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: householdQueries.list().queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: householdQueries.get(household.id).queryKey,
        }),
      ]);
    },
  });

  return (
    <section aria-labelledby="name-heading" className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id="name-heading">
        Household name
      </h2>
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                autoComplete="off"
                description="Everyone in the household sees it."
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
