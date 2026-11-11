"use client";

import type { Chore } from "@homesplit/contracts";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  useIsDeparted,
  useUserName,
} from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import {
  type ChoreFormValues,
  changedFields,
  choreValues,
  toChoreRequest,
  UNASSIGNED,
  validateChore,
} from "@/lib/chores";
import { applyServerErrors, showServerErrors } from "@/lib/form";
import { DeadlineField } from "./deadline-field";

interface ChoreDialogProps {
  /** The chore to edit, or `null` for a new one. */
  chore: Chore | null;
  /** Changes whenever the dialog opens, so each opening starts a fresh form. */
  formKey: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ChoreDialog({
  chore,
  formKey,
  open,
  onOpenChange,
}: ChoreDialogProps) {
  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent>
        <ChoreForm
          chore={chore}
          key={formKey}
          onSaved={() => onOpenChange(false)}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ChoreForm({
  chore,
  onSaved,
}: {
  chore: Chore | null;
  onSaved: () => void;
}) {
  const { household, members } = useHousehold();
  const householdId = household.id;
  const isDeparted = useIsDeparted();
  const userName = useUserName();
  const queryClient = useQueryClient();
  const invalidateList = () =>
    invalidate(queryClient, [
      queryKeys.endpoint("listChores", { params: { householdId } }),
    ]);
  const save = useMutation({
    mutationFn: (values: ChoreFormValues) =>
      chore
        ? api("updateChore", {
            params: { householdId, choreId: chore.id },
            body: changedFields(chore, values),
          })
        : api("createChore", {
            params: { householdId },
            body: toChoreRequest(values),
          }),
  });
  const form = useAppForm({
    defaultValues: choreValues(chore),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ({ value }) => validateChore(value) },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(value);
      } catch (error) {
        if (chore && isApiRequestError(error) && error.status === 404) {
          showServerErrors(formApi, {
            fields: {},
            form: "Someone deleted this chore in the meantime.",
          });
          await invalidateList();
        } else {
          applyServerErrors(formApi, error);
        }
        return;
      }
      await invalidateList();
      onSaved();
    },
  });

  const assignees = [
    { value: UNASSIGNED, label: "Unassigned" },
    ...members.map((member) => ({
      value: member.userId,
      label: member.user.name,
    })),
  ];
  // Someone who left stays selectable on their own chore until it's reassigned.
  if (chore?.assignedTo && isDeparted(chore.assignedTo)) {
    assignees.push({
      value: chore.assignedTo.id,
      label: userName(chore.assignedTo),
    });
  }

  return (
    <form.AppForm>
      <form.Form className="contents">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {chore ? `Edit “${chore.name}”` : "New chore"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Everyone in the household sees it.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => <field.TextField autoComplete="off" label="Name" />}
          </form.AppField>
          <form.AppField name="description">
            {(field) => <field.TextareaField label="Description" />}
          </form.AppField>
          <form.AppField name="assignedToId">
            {(field) => (
              <field.SelectField items={assignees} label="Assignee" />
            )}
          </form.AppField>
          <form.Subscribe
            selector={(state) =>
              `${state.values.dueDate}T${state.values.dueTime}`
            }
          >
            {(due) => (
              <DeadlineField
                date={due.split("T")[0] ?? ""}
                onChange={(date, time) => {
                  form.setFieldValue("dueDate", date);
                  form.setFieldValue("dueTime", time);
                }}
                time={due.split("T")[1] ?? ""}
              />
            )}
          </form.Subscribe>
          <form.FormError />
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            Cancel
          </ResponsiveDialogClose>
          <form.SubmitButton>{chore ? "Save" : "Add chore"}</form.SubmitButton>
        </ResponsiveDialogFooter>
      </form.Form>
    </form.AppForm>
  );
}
