"use client";

import type { Expense, UserSummary } from "@homesplit/contracts";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";
import { parseExpenseFilters } from "@/lib/expenses";
import { ExpenseFiltersBar } from "./expense-filters";
import { ExpenseList } from "./expense-list";

/** Everyone's expenses, filtered by the URL's query, with infinite scroll. */
export default function ExpensesPage() {
  const enabled = useFeatureEnabled("expenses");
  const search = useSearchParams();
  const filters = useMemo(
    () => parseExpenseFilters(new URLSearchParams(search.toString())),
    [search]
  );
  const [seenUsers, setSeenUsers] = useState<UserSummary[]>([]);
  const onLoaded = useCallback((expenses: Expense[]) => {
    const users = new Map<string, UserSummary>();
    for (const expense of expenses) {
      for (const { user } of [...expense.payers, ...expense.splits]) {
        users.set(user.id, user);
      }
    }
    setSeenUsers((previous) => {
      for (const user of previous) {
        users.set(user.id, user);
      }
      return [...users.values()];
    });
  }, []);

  return (
    <>
      <PageHeader title="Expenses" />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      <ExpenseFiltersBar filters={filters} seenUsers={seenUsers} />
      <ExpenseList filters={filters} onLoaded={onLoaded} />
    </>
  );
}
