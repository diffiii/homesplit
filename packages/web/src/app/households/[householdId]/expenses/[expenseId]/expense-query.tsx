"use client";

import type { Expense } from "@homesplit/contracts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useHouseholdId } from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { endpointQuery } from "@/lib/api/queries";

/** The expense in the URL, and where its pages link to. */
export function useExpenseRoute() {
  const householdId = useHouseholdId();
  const { expenseId } = useParams<{ expenseId: string }>();
  const query = useQuery(
    endpointQuery("getExpense", { params: { householdId, expenseId } })
  );
  // The list's filters come along in the query, so going back keeps them.
  const search = useSearchParams().toString();
  const suffix = search && `?${search}`;
  const listPath = householdPath(householdId, "expenses");
  return {
    householdId,
    expenseId,
    query,
    listPath: `${listPath}${suffix}`,
    expensePath: `${listPath}/${expenseId}${suffix}`,
    editPath: `${listPath}/${expenseId}/edit${suffix}`,
  };
}

interface ExpenseQueryStateProps {
  children: (expense: Expense) => ReactNode;
  listPath: string;
  query: UseQueryResult<Expense>;
}

export function ExpenseQueryState({
  query,
  listPath,
  children,
}: ExpenseQueryStateProps) {
  switch (query.status) {
    case "pending":
      return <ListSkeleton label="Loading the expense" rows={4} />;
    case "error":
      return isApiRequestError(query.error) && query.error.status === 404 ? (
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
      ) : (
        <ErrorState
          error={query.error}
          onRetry={query.refetch}
          retrying={query.isRefetching}
          title="Couldn't load this expense"
        />
      );
    default:
      return children(query.data);
  }
}
