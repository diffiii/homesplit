"use client";

import type { CreateExpenseRequest, UserSummary } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type ChecklistOption, useAppForm } from "@/components/form";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import {
  useFeatureEnabled,
  useHousehold,
  useHouseholdId,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { UserLabel } from "@/components/user-avatar";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { todayIsoDate } from "@/lib/dates";
import {
  createExpenseServerErrors,
  previewShares,
  type SimpleExpenseValues,
  toCreateExpenseRequest,
  validateSimpleExpense,
} from "@/lib/expense-form";
import { showServerErrors } from "@/lib/form";
import { formatMoney } from "@/lib/money";
import {
  readLastExpenseCurrency,
  rememberExpenseCurrency,
} from "@/lib/recent-currencies";

/** Add an expense the user paid in full, split equally among the people picked. */
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
      {enabled ? (
        <SimpleExpenseForm />
      ) : (
        <ModuleDisabledAlert module="Expenses" />
      )}
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

function SimpleExpenseForm() {
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
  const [defaultValues] = useState<SimpleExpenseValues>(() => ({
    name: "",
    amount: "",
    currency: readLastExpenseCurrency(householdId),
    expenseDate: todayIsoDate(),
    categoryId: null,
    participantIds: members.map(({ id }) => id),
  }));
  const form = useAppForm({
    defaultValues,
    // `CreateExpenseRequest` validates the form, so client and server agree on the rules.
    validators: {
      onSubmit: ({ value }) => validateSimpleExpense(value, userId),
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
          createExpenseServerErrors(error, value.participantIds, nameOf)
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
        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <form.AppField name="participantIds">
              {(field) => (
                <field.ChecklistField
                  description="You paid. It's split equally between everyone checked."
                  label="Split between"
                  options={participantOptions(
                    values,
                    members,
                    seen.current,
                    userId
                  )}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.FormError />
        <form.SubmitButton className="self-start">
          Add expense
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

/**
 * A row per current member, plus anyone still checked who has left, each
 * with their share of what's typed so far.
 */
function participantOptions(
  values: SimpleExpenseValues,
  members: readonly UserSummary[],
  seen: ReadonlyMap<string, UserSummary>,
  userId: string
): ChecklistOption[] {
  const current = new Set(members.map(({ id }) => id));
  const departed = values.participantIds
    .filter((id) => !current.has(id))
    .map((id) => seen.get(id) ?? { id, name: "Someone", imageUrl: null });
  const shares = new Map(
    previewShares(values)?.map((split) => [split.userId, split.amountCents])
  );
  return [...members, ...departed].map((user) => {
    const share = shares.get(user.id);
    return {
      value: user.id,
      label: (
        <UserLabel
          departed={!current.has(user.id)}
          size="sm"
          user={
            user.id === userId ? { ...user, name: `${user.name} (you)` } : user
          }
        />
      ),
      detail:
        share === undefined ? null : (
          <span className="shrink-0 text-sm tabular-nums">
            {formatMoney({ amountCents: share, currency: values.currency })}
          </span>
        ),
    };
  });
}
