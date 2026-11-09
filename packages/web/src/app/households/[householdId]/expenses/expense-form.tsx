"use client";

import type { UserSummary } from "@homesplit/contracts";
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAppForm } from "@/components/form";
import { useHousehold } from "@/components/shell/household-context";
import { isApiRequestError } from "@/lib/api/api-error";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { type ExpenseFormValues, validateExpense } from "@/lib/expense-form";
import { type ServerErrors, showServerErrors } from "@/lib/form";
import { useCategorySuggestion } from "./category-suggestion";
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

interface ExpenseFormProps {
  defaultValues: ExpenseFormValues;
  /**
   * People already on the expense being edited, who stay selectable after
   * leaving the household.
   */
  kept?: readonly UserSummary[];
  /** Saves `values` once they pass `validateExpense`. */
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
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
        await onSubmit(value);
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

  const suggestion = useCategorySuggestion({
    name: useStore(form.store, (state) => state.values.name),
    initial: defaultValues,
    apply: (categoryId) => form.setFieldValue("categoryId", categoryId),
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
            {(field) => (
              <field.CategoryField
                description={suggestion.hint}
                label="Category"
                onPick={suggestion.onPick}
              />
            )}
          </form.AppField>
        </div>
        <p className="sr-only" role="status">
          {suggestion.announcement}
        </p>
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
        <form.FormError />
        <form.SubmitButton className="self-start">
          {submitLabel}
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
