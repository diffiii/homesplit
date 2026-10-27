"use client";

import type { Expense, UserSummary } from "@homesplit/contracts";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import {
  useFeatureEnabled,
  useHouseholdId,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { parseExpenseFilters } from "@/lib/expenses";
import { ExpenseFiltersBar } from "./expense-filters";
import { ExpenseList } from "./expense-list";

/** Everyone's expenses, filtered by the URL's query, with infinite scroll. */
export default function ExpensesPage() {
  const enabled = useFeatureEnabled("expenses");
  const householdId = useHouseholdId();
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
      <PageHeader
        actions={enabled ? <NewExpenseLink householdId={householdId} /> : null}
        title="Expenses"
      />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      <ExpenseFiltersBar filters={filters} seenUsers={seenUsers} />
      <ExpenseList
        emptyAction={
          enabled ? <NewExpenseLink householdId={householdId} /> : null
        }
        filters={filters}
        onLoaded={onLoaded}
      />
    </>
  );
}

function NewExpenseLink({ householdId }: { householdId: string }) {
  return (
    <Link
      className={buttonVariants()}
      href={`${householdPath(householdId, "expenses")}/new`}
    >
      <PlusIcon aria-hidden data-icon="inline-start" />
      Add expense
    </Link>
  );
}
