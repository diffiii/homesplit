"use client";

import type { Expense } from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import {
  useHouseholdId,
  useIsDeparted,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { UserLabel } from "@/components/user-avatar";
import { isApiRequestError } from "@/lib/api/api-error";
import { endpointQuery } from "@/lib/api/queries";
import { formatIsoDate, formatIsoDateTime } from "@/lib/dates";
import { allocationInput, SPLIT_METHOD_LABELS } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";

/** One expense: who paid, how it was split and with what inputs, and its details. */
export default function ExpensePage() {
  const householdId = useHouseholdId();
  const { expenseId } = useParams<{ expenseId: string }>();
  const expense = useQuery(
    endpointQuery("getExpense", { params: { householdId, expenseId } })
  );
  // The list's filters come along in the query, so going back keeps them.
  const search = useSearchParams().toString();
  const listPath = `${householdPath(householdId, "expenses")}${search && `?${search}`}`;

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
      {expense.status === "pending" ? (
        <ListSkeleton label="Loading the expense" rows={4} />
      ) : null}
      {expense.status === "error" &&
      isApiRequestError(expense.error) &&
      expense.error.status === 404 ? (
        <EmptyState
          action={
            <Link className={buttonVariants()} href={listPath}>
              All expenses
            </Link>
          }
          description="It may have been deleted, or the link is wrong."
          icon={SearchXIcon}
          title="Expense not found"
        />
      ) : null}
      {expense.status === "error" &&
      !(isApiRequestError(expense.error) && expense.error.status === 404) ? (
        <ErrorState
          error={expense.error}
          onRetry={expense.refetch}
          retrying={expense.isRefetching}
          title="Couldn't load this expense"
        />
      ) : null}
      {expense.status === "success" ? (
        <ExpenseDetails expense={expense.data} />
      ) : null}
    </>
  );
}

function ExpenseDetails({ expense }: { expense: Expense }) {
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
