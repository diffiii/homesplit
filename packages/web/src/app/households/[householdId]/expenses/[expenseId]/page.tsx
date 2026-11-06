"use client";

import type { Expense } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import {
  useFeatureEnabled,
  useHouseholdId,
  useIsDeparted,
  usePermissions,
} from "@/components/shell/household-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { UserLabel } from "@/components/user-avatar";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { ledgerQueryKeys } from "@/lib/api/expense-queries";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatIsoDate, formatIsoDateTime } from "@/lib/dates";
import { allocationInput, SPLIT_METHOD_LABELS } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import { ExpenseQueryState, useExpenseRoute } from "./expense-query";

/** One expense: who paid, how it was split and with what inputs, and its details. */
export default function ExpensePage() {
  const { query, listPath, editPath } = useExpenseRoute();

  return (
    <>
      <Link
        className={buttonVariants({
          className: "self-start",
          size: "sm",
          variant: "ghost",
        })}
        href={listPath}
      >
        <ArrowLeftIcon aria-hidden data-icon="inline-start" />
        All expenses
      </Link>
      <ExpenseQueryState listPath={listPath} query={query}>
        {(expense) => (
          <ExpenseDetails
            editPath={editPath}
            expense={expense}
            listPath={listPath}
          />
        )}
      </ExpenseQueryState>
    </>
  );
}

function ExpenseActions({
  expense,
  editPath,
  listPath,
}: {
  editPath: string;
  expense: Expense;
  listPath: string;
}) {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const del = useMutation({
    mutationFn: () =>
      api("deleteExpense", { params: { householdId, expenseId: expense.id } }),
  });
  if (!enabled) {
    return null;
  }

  const remove = async () => {
    try {
      await del.mutateAsync();
    } catch (error) {
      // Someone deleted it first, which is what the user wanted anyway.
      if (!(isApiRequestError(error) && error.status === 404)) {
        throw error;
      }
    }
    await invalidate(queryClient, ledgerQueryKeys(householdId));
    router.replace(listPath);
    queryClient.removeQueries({
      queryKey: queryKeys.endpoint("getExpense", {
        params: { householdId, expenseId: expense.id },
      }),
    });
  };

  return (
    <>
      {permissions.editExpense(expense) ? (
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={editPath}
        >
          <PencilIcon aria-hidden data-icon="inline-start" />
          Edit
        </Link>
      ) : null}
      {permissions.deleteExpense(expense) ? (
        <ConfirmDialog
          confirmLabel="Delete"
          description="Everyone's balances will be recalculated without it. Recorded payments stay as they are. This can't be undone."
          destructive
          onConfirm={remove}
          title={`Delete “${expense.name}”?`}
          trigger={
            <Button variant="outline">
              <Trash2Icon aria-hidden data-icon="inline-start" />
              Delete
            </Button>
          }
        />
      ) : null}
    </>
  );
}

function ExpenseDetails({
  expense,
  editPath,
  listPath,
}: {
  editPath: string;
  expense: Expense;
  listPath: string;
}) {
  const isDeparted = useIsDeparted();
  const { currency } = expense.total;
  const participantIds = expense.allocation.participants.map((p) => p.userId);
  // Splits in the order the participants were entered.
  const splits = [...expense.splits].sort(
    (a, b) =>
      participantIds.indexOf(a.user.id) - participantIds.indexOf(b.user.id)
  );

  return (
    <>
      <PageHeader
        actions={
          <ExpenseActions
            editPath={editPath}
            expense={expense}
            listPath={listPath}
          />
        }
        description={
          <span className="text-foreground text-xl font-medium tabular-nums">
            {formatMoney(expense.total)}
          </span>
        }
        title={expense.name}
      />

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <Detail label="Date">
          <time dateTime={expense.expenseDate}>
            {formatIsoDate(expense.expenseDate)}
          </time>
        </Detail>
        <Detail label="Category">
          <span className="inline-flex items-center gap-2">
            <CategoryIcon category={expense.category} className="size-6" />
            {expense.category?.name ?? "No category"}
          </span>
        </Detail>
        <Detail label="Added by">
          <UserLabel
            departed={isDeparted(expense.author)}
            size="sm"
            user={expense.author}
          />
        </Detail>
        <Detail label="Added">
          <time dateTime={expense.createdAt}>
            {formatIsoDateTime(expense.createdAt)}
          </time>
        </Detail>
        {expense.description ? (
          <Detail label="Description">
            <p className="whitespace-pre-line">{expense.description}</p>
          </Detail>
        ) : null}
      </dl>

      <section aria-labelledby="payers-heading" className="flex flex-col gap-3">
        <h2 className="text-base font-medium" id="payers-heading">
          Paid by
        </h2>
        <ul className="flex flex-col divide-y rounded-xl border">
          {expense.payers.map(({ user, amountCents }) => (
            <li className="flex items-center gap-3 px-4 py-2" key={user.id}>
              <span className="min-w-0 flex-1">
                <UserLabel departed={isDeparted(user)} size="sm" user={user} />
              </span>
              <span className="tabular-nums">
                {formatMoney({ amountCents, currency })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="split-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium" id="split-heading">
            Split
          </h2>
          <p className="text-muted-foreground text-sm">
            {SPLIT_METHOD_LABELS[expense.allocation.method]}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th scope="col">Person</th>
              {expense.allocation.method === "equal" ? null : (
                <th scope="col">Input</th>
              )}
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {splits.map(({ user, amountCents }) => (
              <tr key={user.id}>
                <th className="py-2 pr-3 text-left font-normal" scope="row">
                  <UserLabel
                    departed={isDeparted(user)}
                    size="sm"
                    user={user}
                  />
                </th>
                {expense.allocation.method === "equal" ? null : (
                  <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                    {allocationInput(expense.allocation, user.id, currency)}
                  </td>
                )}
                <td className="py-2 text-right font-medium tabular-nums">
                  {formatMoney({ amountCents, currency })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Detail({ label, children }: { children: ReactNode; label: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
