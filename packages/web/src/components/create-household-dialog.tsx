"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { householdPath } from "@/components/shell/household-nav";
import { Button } from "@/components/ui/button";
import { households } from "@/lib/api/auth-client";
import { householdQueries } from "@/lib/api/household-queries";
import { applyServerErrors } from "@/lib/form";

const CreateHouseholdValues = z.object({
  // Better Auth requires a nonempty name, with no maximum length.
  name: z.string().trim().min(1, "Give the household a name."),
});

export function CreateHouseholdDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation({ mutationFn: households.create });
  const form = useAppForm({
    defaultValues: { name: "" },
    validators: { onSubmit: CreateHouseholdValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        const household = await create.mutateAsync({ name: value.name.trim() });
        if (!household) {
          throw new Error("Better Auth created no household");
        }
        // Show the new household immediately, even if the next list request fails.
        const list = householdQueries.list();
        await queryClient.cancelQueries({ queryKey: list.queryKey });
        queryClient.setQueryData(list.queryKey, (previous = []) => [
          ...previous.filter(({ id }) => id !== household.id),
          household,
        ]);
        queryClient.invalidateQueries({ queryKey: list.queryKey });
        onOpenChange(false);
        formApi.reset();
        router.push(householdPath(household.id));
      } catch (error) {
        applyServerErrors(formApi, error);
      }
    },
  });

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        if (create.isPending) {
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
              <ResponsiveDialogTitle>New household</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                You'll be its owner and can invite others afterwards.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody className="flex flex-col gap-4">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    autoComplete="off"
                    disabled={create.isPending}
                    label="Name"
                  />
                )}
              </form.AppField>
              <form.FormError />
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose
                render={
                  <Button disabled={create.isPending} variant="outline" />
                }
              >
                Cancel
              </ResponsiveDialogClose>
              <form.SubmitButton>Create</form.SubmitButton>
            </ResponsiveDialogFooter>
          </form.Form>
        </form.AppForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
