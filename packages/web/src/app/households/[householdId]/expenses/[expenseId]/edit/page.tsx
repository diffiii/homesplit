"use client";

import type { Expense } from "@homesplit/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import {
  useFeatureEnabled,
  useHousehold,
  usePermissions,
} from "@/components/shell/household-context";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { ledgerQueryKeys } from "@/lib/api/expense-queries";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import {
  expenseFormValues,
  toUpdateExpenseRequest,
  updateExpenseServerErrors,
} from "@/lib/expense-form";
import { ExpenseForm } from "../../expense-form";
import { ExpenseQueryState, useExpenseRoute } from "../expense-query";

/** Edit an expense in the form it was added with. */
export default function EditExpensePage() {
  const { query, listPath, expensePath } = useExpenseRoute();

  return (
    <>
      <Link
        className={buttonVariants({
          className: "self-start",
          size: "sm",
          variant: "ghost",
        })}
        href={expensePath}
      >
        <ArrowLeftIcon aria-hidden data-icon="inline-start" />
        Back to expense
      </Link>
      <PageHeader title="Edit expense" />
      <ExpenseQueryState listPath={listPath} query={query}>
        {(expense) => (
          <EditableExpense expense={expense} expensePath={expensePath} />
        )}
      </ExpenseQueryState>
    </>
  );
}

function EditableExpense({
  expense,
  expensePath,
}: {
  expense: Expense;
  expensePath: string;
}) {
  const enabled = useFeatureEnabled("expenses");
  const permissions = usePermissions();
  if (!enabled) {
    return <ModuleDisabledAlert module="Expenses" />;
  }
  if (!permissions.editExpense(expense)) {
    return (
      <EmptyState
        action={
          <Link className={buttonVariants()} href={expensePath}>
            Back to expense
          </Link>
        }
        description="Only the person who added it, an admin, or an owner can."
        icon={LockIcon}
        title="You can't edit this expense"
      />
    );
  }
  return <EditExpenseForm expense={expense} expensePath={expensePath} />;
}

function EditExpenseForm({
  expense: loaded,
  expensePath,
}: {
  expense: Expense;
  expensePath: string;
}) {
  const { household, userId } = useHousehold();
  const householdId = household.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  // The form edits the expense as it was when it opened, and only what
  // differs from that is sent, even if the query refetches meanwhile.
  const [expense] = useState(loaded);
  const [defaultValues] = useState(() => expenseFormValues(expense, userId));
  const [kept] = useState(() => [
    ...new Map(
      [
        ...expense.payers.map(({ user }) => user),
        ...expense.splits.map(({ user }) => user),
      ].map((user) => [user.id, user])
    ).values(),
  ]);

  return (
    <ExpenseForm
      defaultValues={defaultValues}
      kept={kept}
      onSubmit={async (value) => {
        const body = toUpdateExpenseRequest(value, expense, userId);
        if (!body) {
          return;
        }
        if (Object.keys(body).length === 0) {
          // Nothing changed, and the API rejects an empty patch.
          router.push(expensePath);
          return;
        }
        const saved = await api("updateExpense", {
          params: { householdId, expenseId: expense.id },
          body,
        });
        queryClient.setQueryData(
          queryKeys.endpoint("getExpense", {
            params: { householdId, expenseId: saved.id },
          }),
          saved
        );
        await invalidate(queryClient, ledgerQueryKeys(householdId));
        router.push(expensePath);
      }}
      serverErrors={(error, value, nameOf) =>
        updateExpenseServerErrors(error, value, nameOf, expense)
      }
      submitLabel="Save changes"
    />
  );
}
