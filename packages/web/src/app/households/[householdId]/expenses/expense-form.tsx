"use client";

import type {
  Attachment,
  AttachmentSummary,
  Expense,
  UserSummary,
} from "@homesplit/contracts";
import { revalidateLogic } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUpload } from "@/components/file-upload";
import { useAppForm } from "@/components/form";
import { useHousehold } from "@/components/shell/household-context";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { attachErrorMessage } from "@/lib/attachments";
import { type ExpenseFormValues, validateExpense } from "@/lib/expense-form";
import { type ServerErrors, showServerErrors } from "@/lib/form";
import { AdvancedSplit, SimpleSplit } from "./expense-split";

/** Current members as `UserSummary`, the user first and then by name. */
export function useMemberSummaries(): UserSummary[] {
  const { members, userId } = useHousehold();
  return members
    .map(({ user }) => ({
      id: user.id,
      name: user.name,
      imageUrl: user.image ?? null,
    }))
    .sort(
      (a, b) =>
        Number(b.id === userId) - Number(a.id === userId) ||
        a.name.localeCompare(b.name, "en")
    );
}

const NO_ONE: readonly UserSummary[] = [];

/**
 * Links files uploaded in the form to the saved expense, one at a time so
 * they keep the order they were added in, and adds them to its cached copy.
 * The expense is saved by then, so a file that can't be linked is reported
 * in a toast rather than failing the form.
 */
export function useAttachFiles() {
  const { household } = useHousehold();
  const queryClient = useQueryClient();
  return async (expenseId: string, attachments: readonly Attachment[]) => {
    const params = { householdId: household.id, expenseId };
    const linked: AttachmentSummary[] = [];
    const failures: unknown[] = [];
    for (const { id } of attachments) {
      try {
        linked.push(
          // biome-ignore lint/performance/noAwaitInLoops: one at a time, so the files are linked in the order they were added.
          await api("linkExpenseAttachment", {
            params,
            body: { attachmentId: id },
          })
        );
      } catch (error) {
        failures.push(error);
      }
    }
    queryClient.setQueryData<Expense>(
      queryKeys.endpoint("getExpense", { params }),
      (expense) =>
        expense && {
          ...expense,
          attachments: [
            ...expense.attachments.filter(
              ({ id }) => !linked.some((summary) => summary.id === id)
            ),
            ...linked,
          ],
        }
    );
    const [failure] = failures;
    if (failure !== undefined) {
      const files =
        failures.length === 1 ? "a file" : `${failures.length} files`;
      toast.error(
        `The expense was saved, but ${files} couldn't be attached. ${attachErrorMessage(failure)}`
      );
    }
  };
}

interface ExpenseFormProps {
  defaultValues: ExpenseFormValues;
  /**
   * People already on the expense being edited, who stay selectable after
   * leaving the household.
   */
  kept?: readonly UserSummary[];
  /**
   * Saves `values` once they pass `validateExpense`, and attaches the files
   * uploaded in the form, in the order they were added.
   */
  onSubmit: (
    values: ExpenseFormValues,
    attachments: readonly Attachment[]
  ) => Promise<void>;
  /** Where the server's answer to a failed `onSubmit` goes. */
  serverErrors: (
    error: unknown,
    values: ExpenseFormValues,
    nameOf: (userId: string) => string
  ) => ServerErrors;
  submitLabel: string;
}

/**
 * The expense form, for adding and editing: by default the user paid it all
 * and it's split equally, and the advanced section takes any payers and split
 * the API accepts.
 */
export function ExpenseForm({
  defaultValues,
  kept = NO_ONE,
  onSubmit,
  serverErrors,
  submitLabel,
}: ExpenseFormProps) {
  const { household, userId } = useHousehold();
  const queryClient = useQueryClient();
  const members = useMemberSummaries();

  // Everyone shown so far, so a participant who leaves while the form is open
  // keeps a row to uncheck and a name for the error.
  const seen = useRef(new Map(kept.map((user) => [user.id, user])));
  useEffect(() => {
    for (const member of members) {
      seen.current.set(member.id, member);
    }
  }, [members]);
  const nameOf = (id: string) => seen.current.get(id)?.name ?? "Someone";

  const [uploading, setUploading] = useState(false);
  // Read when submitting, which may run after the render that set them.
  const attachments = useRef<readonly Attachment[]>([]);

  const form = useAppForm({
    defaultValues,
    // `CreateExpenseRequest` validates the form, so client and server agree on
    // the rules. After a failed submit it checks again on every change, so a
    // message goes away once its cause is fixed, wherever that was.
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => validateExpense(value, userId),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(value, attachments.current);
      } catch (error) {
        showServerErrors(formApi, serverErrors(error, value, nameOf));
        if (isApiRequestError(error) && error.code === "INVALID_REFERENCE") {
          // Someone left or a category is gone: show the household as it is now.
          await invalidate(queryClient, [
            queryKeys.householdAuth(household.id, "get"),
            queryKeys.endpoint("listExpenseCategories", {
              params: { householdId: household.id },
            }),
          ]);
        }
      }
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              autoComplete="off"
              label="Name"
              placeholder="Groceries"
            />
          )}
        </form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Subscribe selector={(state) => state.values.currency}>
            {(currency) => (
              <form.AppField name="amount">
                {(field) => (
                  <field.MoneyField currency={currency} label="Amount" />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="currency">
            {(field) => <field.CurrencyField label="Currency" />}
          </form.AppField>
          <form.AppField name="expenseDate">
            {(field) => <field.DateField label="Date" />}
          </form.AppField>
          <form.AppField name="categoryId">
            {(field) => <field.CategoryField label="Category" />}
          </form.AppField>
        </div>
        <form.Subscribe selector={(state) => state.values.advanced}>
          {(advanced) =>
            advanced ? (
              <AdvancedSplit
                form={form}
                kept={kept}
                members={members}
                nameOf={nameOf}
                seen={seen.current}
                userId={userId}
              />
            ) : (
              <SimpleSplit
                form={form}
                kept={kept}
                members={members}
                nameOf={nameOf}
                seen={seen.current}
                userId={userId}
              />
            )
          }
        </form.Subscribe>
        <FieldSet className="gap-2">
          <FieldLegend variant="label">Files</FieldLegend>
          <FieldDescription>
            Photos of the receipt, the invoice, or anything else that documents
            it.
          </FieldDescription>
          <FileUpload
            householdId={household.id}
            onAttachmentsChange={(uploaded) => {
              attachments.current = uploaded;
            }}
            onPendingChange={setUploading}
          />
        </FieldSet>
        <form.FormError />
        <div className="flex flex-wrap items-center gap-3">
          <form.SubmitButton disabled={uploading}>
            {submitLabel}
          </form.SubmitButton>
          {uploading ? (
            <p className="text-muted-foreground text-sm">
              Waiting for the files to upload…
            </p>
          ) : null}
        </div>
      </form.Form>
    </form.AppForm>
  );
}
