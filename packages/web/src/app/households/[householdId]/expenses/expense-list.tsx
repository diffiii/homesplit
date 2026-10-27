"use client";

import type { Expense } from "@homesplit/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ReceiptIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useHousehold } from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { expenseListQuery } from "@/lib/api/expense-queries";
import {
  type ExpenseFilters,
  formatGroupDate,
  formatPayers,
  groupByDate,
  hasFilters,
  userNet,
} from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import { useSetExpenseFilters } from "./expense-filters";

/** Load the next page this far before the end of the list comes into view. */
const PRELOAD_MARGIN = "400px";

interface ExpenseListProps {
  /** Shown in the empty state, such as a link to add the first expense. */
  emptyAction?: ReactNode;
  filters: ExpenseFilters;
  /** Called with every expense loaded so far, so the filters can offer their people. */
  onLoaded?: (expenses: Expense[]) => void;
}

/**
 * Expenses newest first, grouped by date, loading the next page as the end of
 * the list scrolls into view. A button does the same for keyboard and screen
 * reader users, and wherever the observer isn't available.
 */
export function ExpenseList({
  emptyAction,
  filters,
  onLoaded,
}: ExpenseListProps) {
  const { household } = useHousehold();
  const list = useInfiniteQuery(expenseListQuery(household.id, filters));
  const pages = list.data ? list.data.pages : null;
  const expenses = useMemo(
    () => pages?.flatMap((page) => page.items) ?? [],
    [pages]
  );
  const totalItems = pages?.at(-1)?.totalItems ?? 0;

  useEffect(() => {
    onLoaded?.(expenses);
  }, [expenses, onLoaded]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const loadMore = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = loadMore.current;
    if (
      !(button && hasNextPage) ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: PRELOAD_MARGIN }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (list.status === "pending") {
    return <ListSkeleton label="Loading expenses" rows={6} />;
  }
  if (list.status === "error") {
    return (
      <ErrorState
        error={list.error}
        onRetry={list.refetch}
        retrying={list.isRefetching}
        title="Couldn't load expenses"
      />
    );
  }
  if (expenses.length === 0) {
    return hasFilters(filters) ? (
      <NoMatches />
    ) : (
      <EmptyState
        action={emptyAction}
        description="Expenses everyone adds show up here, newest first."
        icon={ReceiptIcon}
        title="No expenses yet"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groupByDate(expenses).map((group) => (
        <section
          aria-labelledby={`expenses-${group.date}`}
          className="flex flex-col gap-2"
          key={group.date}
        >
          <h2
            className="font-medium text-muted-foreground text-sm"
            id={`expenses-${group.date}`}
          >
            <time dateTime={group.date}>{formatGroupDate(group.date)}</time>
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {group.expenses.map((expense) => (
              <ExpenseRow expense={expense} key={expense.id} />
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-col items-center gap-2">
        <p aria-live="polite" className="text-muted-foreground text-sm">
          Showing {expenses.length} of {totalItems}{" "}
          {totalItems === 1 ? "expense" : "expenses"}
        </p>
        {hasNextPage ? (
          <Button
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            ref={loadMore}
            variant="outline"
          >
            {isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
            Load more
          </Button>
        ) : null}
        {list.isFetchNextPageError ? (
          <p className="text-destructive text-sm" role="alert">
            Couldn't load more expenses. Try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NoMatches() {
  const setFilters = useSetExpenseFilters();
  return (
    <EmptyState
      action={
        <Button onClick={() => setFilters({})} variant="outline">
          Clear filters
        </Button>
      }
      description="Try another category, person, or date range."
      icon={SearchXIcon}
      title="No expenses match"
    />
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const { household, userId } = useHousehold();
  // The detail page links back to the list with the same filters.
  const search = useSearchParams().toString();
  const net = userNet(expense, userId);
  return (
    <li>
      <Link
        className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        href={`${householdPath(household.id, "expenses")}/${expense.id}${search && `?${search}`}`}
      >
        <CategoryIcon category={expense.category} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{expense.name}</span>
          <span className="truncate text-muted-foreground text-sm">
            {expense.category ? `${expense.category.name} · ` : null}
            Paid by {formatPayers(expense)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="font-medium tabular-nums">
            {formatMoney(expense.total)}
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              net.kind === "owes" && "text-destructive",
              (net.kind === "settled" || net.kind === "not-involved") &&
                "text-muted-foreground"
            )}
          >
            {net.kind === "lent" || net.kind === "owes" ? net.text : null}
            {net.kind === "settled" ? "Settled" : null}
            {net.kind === "not-involved" ? "Not involved" : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
