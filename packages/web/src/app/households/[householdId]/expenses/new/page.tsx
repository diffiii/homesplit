"use client";

import type { CreateExpenseRequest, UserSummary } from "@homesplit/contracts";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAppForm } from "@/components/form";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import {
  useFeatureEnabled,
  useHousehold,
  useHouseholdId,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { todayIsoDate } from "@/lib/dates";
import {
  createExpenseServerErrors,
  initialExpenseValues,
  toCreateExpenseRequest,
  validateExpense,
} from "@/lib/expense-form";
import { showServerErrors } from "@/lib/form";
import {
  readLastExpenseCurrency,
  rememberExpenseCurrency,
} from "@/lib/recent-currencies";
import { AdvancedSplit, SimpleSplit } from "./expense-split";

/**
 * Add an expense: by default the user paid it all and it's split equally, and
 * the advanced section takes any payers and split the API accepts.
 */
export default function NewExpensePage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  return (
    <>
      <Link
        className={buttonVariants({
          className: "self-start",
          size: "sm",
          variant: "ghost",
        })}
        href={householdPath(householdId, "expenses")}
      >
        <ArrowLeftIcon aria-hidden data-icon="inline-start" />
        All expenses
      </Link>
      <PageHeader title="New expense" />
      {enabled ? <ExpenseForm /> : <ModuleDisabledAlert module="Expenses" />}
    </>
  );
}

/** Current members as `UserSummary`, the user first and then by name. */
function useMemberSummaries(): UserSummary[] {
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

function ExpenseForm() {
  const { household, userId } = useHousehold();
  const householdId = household.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const members = useMemberSummaries();

  // Everyone shown so far, so a participant who leaves while the form is open
  // keeps a row to uncheck and a name for the error.
  const seen = useRef(new Map<string, UserSummary>());
  useEffect(() => {
    for (const member of members) {
      seen.current.set(member.id, member);
    }
  }, [members]);
  const nameOf = (id: string) => seen.current.get(id)?.name ?? "Someone";

  const create = useMutation({
    mutationFn: (body: CreateExpenseRequest) =>
      api("createExpense", { params: { householdId }, body }),
  });
  const [defaultValues] = useState(() =>
    initialExpenseValues({
      currency: readLastExpenseCurrency(householdId),
      expenseDate: todayIsoDate(),
      participantIds: members.map(({ id }) => id),
      userId,
    })
  );
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
      const body = toCreateExpenseRequest(value, userId);
      if (!body) {
        return;
      }
      let expense: Awaited<ReturnType<typeof create.mutateAsync>>;
      try {
        expense = await create.mutateAsync(body);
      } catch (error) {
        showServerErrors(
          formApi,
          createExpenseServerErrors(error, value, nameOf)
        );
        if (isApiRequestError(error) && error.code === "INVALID_REFERENCE") {
          // Someone left or a category is gone: show the household as it is now.
          await invalidate(queryClient, [
            queryKeys.householdAuth(householdId, "get"),
            queryKeys.endpoint("listExpenseCategories", {
              params: { householdId },
            }),
          ]);
        }
        return;
      }
      rememberExpenseCurrency(householdId, value.currency);
      queryClient.setQueryData(
        queryKeys.endpoint("getExpense", {
          params: { householdId, expenseId: expense.id },
        }),
        expense
      );
      await invalidate(queryClient, [
        queryKeys.endpoint("listExpenses", { params: { householdId } }),
        queryKeys.endpoint("listBalances", { params: { householdId } }),
        queryKeys.endpoint("listSettlementSuggestions", {
          params: { householdId },
        }),
      ]);
      router.push(`${householdPath(householdId, "expenses")}/${expense.id}`);
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
                members={members}
                nameOf={nameOf}
                seen={seen.current}
                userId={userId}
              />
            ) : (
              <SimpleSplit
                form={form}
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
          Add expense
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
