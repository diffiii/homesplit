"use client";

import type { CreateExpenseRequest } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import {
  useFeatureEnabled,
  useHousehold,
  useHouseholdId,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { ledgerQueryKeys } from "@/lib/api/expense-queries";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { todayIsoDate } from "@/lib/dates";
import {
  createExpenseServerErrors,
  initialExpenseValues,
  toCreateExpenseRequest,
} from "@/lib/expense-form";
import {
  readLastExpenseCurrency,
  rememberExpenseCurrency,
} from "@/lib/recent-currencies";
import {
  ExpenseForm,
  useAttachFiles,
  useMemberSummaries,
} from "../expense-form";
import { ScanReceiptDialog } from "../receipts/scan-receipt-dialog";

/**
 * Add an expense: by default the user paid it all and it's split equally, and
 * the advanced section takes any payers and split the API accepts.
 */
export default function NewExpensePage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  // Like every AI feature, scanning isn't shown while AI is off.
  const ai = useFeatureEnabled("ai");
  const scanning = enabled && ai;
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
      <PageHeader
        actions={scanning ? <ScanReceiptDialog variant="outline" /> : null}
        description={
          scanning
            ? "Have a receipt? Scan it to split it item by item."
            : undefined
        }
        title="New expense"
      />
      {enabled ? <NewExpenseForm /> : <ModuleDisabledAlert module="Expenses" />}
    </>
  );
}

function NewExpenseForm() {
  const { household, userId } = useHousehold();
  const householdId = household.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const members = useMemberSummaries();
  const attachFiles = useAttachFiles();

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

  return (
    <ExpenseForm
      defaultValues={defaultValues}
      onSubmit={async (value, attachments) => {
        const body = toCreateExpenseRequest(value, userId);
        if (!body) {
          return;
        }
        const expense = await create.mutateAsync(body);
        rememberExpenseCurrency(householdId, value.currency);
        queryClient.setQueryData(
          queryKeys.endpoint("getExpense", {
            params: { householdId, expenseId: expense.id },
          }),
          expense
        );
        await attachFiles(expense.id, attachments);
        await invalidate(queryClient, ledgerQueryKeys(householdId));
        router.push(`${householdPath(householdId, "expenses")}/${expense.id}`);
      }}
      serverErrors={createExpenseServerErrors}
      submitLabel="Add expense"
    />
  );
}
