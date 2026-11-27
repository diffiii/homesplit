"use client";

import type { Receipt, UserSummary } from "@homesplit/contracts";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import {
  useFeatureEnabled,
  useHousehold,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { ledgerQueryKeys } from "@/lib/api/expense-queries";
import { endpointQuery, invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import {
  receiptListKey,
  receiptQuery,
  receiptSplitQuery,
} from "@/lib/api/receipt-queries";
import { todayIsoDate } from "@/lib/dates";
import { applyServerErrors, showServerErrors } from "@/lib/form";
import {
  type ConfirmReceiptValues,
  confirmDefaults,
  toConfirmReceiptRequest,
  validateConfirm,
} from "@/lib/receipt-assignment";
import { SplitSummary } from "./receipt-split-summary";

/** Why confirming failed, for the codes that mean the receipt changed under the member. */
const CONFIRM_CONFLICTS: Record<string, string> = {
  RECEIPT_ITEMS_UNASSIGNED:
    "Some items aren't assigned any more. Check them and try again.",
  RECEIPT_TOTAL_MISMATCH:
    "The items don't add up to the total any more. Check them and try again.",
  RECEIPT_INCOMPLETE: "The receipt needs a currency and a total.",
  RECEIPT_ASSIGNEE_NOT_MEMBER:
    "Someone the items are assigned to has left the household. Take them off the items first.",
  RECEIPT_CONFIRMED: "This receipt was added as an expense in the meantime.",
  RECEIPT_PROCESSING: "The receipt is being read again. Wait for it to finish.",
  RECEIPT_NOT_READY: "Fill in the receipt before adding it as an expense.",
};

function useConfirmForm(receipt: Receipt) {
  const { household, members, userId } = useHousehold();
  const householdId = household.id;
  const queryClient = useQueryClient();
  const router = useRouter();
  const shopping = useFeatureEnabled("shopping");
  const memberIds = useMemo(
    () => new Set(members.map((member) => member.userId)),
    [members]
  );
  const defaultValues = useMemo(
    () =>
      confirmDefaults(receipt, { memberIds, today: todayIsoDate(), userId }),
    [receipt, memberIds, userId]
  );
  const confirm = useMutation({
    mutationFn: (values: ConfirmReceiptValues) =>
      api("confirmReceipt", {
        params: { householdId, receiptId: receipt.id },
        body: toConfirmReceiptRequest(values),
      }),
  });
  return useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ({ value }) => validateConfirm(value) },
    onSubmit: async ({ value, formApi }) => {
      try {
        const { receipt: confirmed, expense } =
          await confirm.mutateAsync(value);
        queryClient.setQueryData(
          receiptQuery(householdId, receipt.id).queryKey,
          confirmed
        );
        queryClient.setQueryData(
          queryKeys.endpoint("getExpense", {
            params: { householdId, expenseId: expense.id },
          }),
          expense
        );
        await invalidate(queryClient, [
          receiptListKey(householdId),
          ...ledgerQueryKeys(householdId),
        ]);
        router.push(`${householdPath(householdId, "expenses")}/${expense.id}`);
        toast.success(
          "Added as an expense.",
          shopping
            ? {
                description: "Bought something from the shopping list?",
                action: {
                  label: "Tick off items",
                  onClick: () =>
                    router.push(householdPath(householdId, "shopping")),
                },
              }
            : undefined
        );
      } catch (error) {
        const conflict =
          isApiRequestError(error) && CONFIRM_CONFLICTS[error.code];
        if (conflict) {
          showServerErrors(formApi, { fields: {}, form: conflict });
          await invalidate(queryClient, [
            receiptQuery(householdId, receipt.id).queryKey,
            receiptSplitQuery(householdId, receipt.id).queryKey,
            queryKeys.householdAuth(householdId, "get"),
          ]);
          return;
        }
        applyServerErrors(formApi, error);
        if (isApiRequestError(error) && error.code === "INVALID_REFERENCE") {
          // The payer left or the category is gone: show them as they are now.
          await invalidate(queryClient, [
            queryKeys.householdAuth(householdId, "get"),
            queryKeys.endpoint("listExpenseCategories", {
              params: { householdId },
            }),
          ]);
        }
      }
    },
  });
}

/**
 * What the scan suggested for the category. Only a confident suggestion is
 * filled in, as the API does; a less sure one is offered here to use with a
 * tap while no category is picked.
 */
function ScanSuggestion({
  suggestion,
  value,
  onUse,
}: {
  onUse: (categoryId: string) => void;
  suggestion: Receipt["suggestedCategory"];
  value: string | null;
}) {
  const { household } = useHousehold();
  const categories = useQuery(
    endpointQuery("listExpenseCategories", {
      params: { householdId: household.id },
    })
  );
  const category = categories.data?.items.find(
    ({ id }) => id === suggestion?.categoryId
  );
  if (!(suggestion && category)) {
    return null;
  }
  if (value === category.id) {
    return (
      <span className="flex items-center gap-1.5">
        <SparklesIcon aria-hidden className="size-4" />
        Suggested by the scan
      </span>
    );
  }
  if (value !== null) {
    return null;
  }
  const unsure = suggestion.confidence !== "high";
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <SparklesIcon aria-hidden className="size-4" />
      The scan suggests {category.name}
      {unsure ? ", but isn't sure." : "."}
      <Button
        className="h-auto p-0"
        onClick={() => onUse(category.id)}
        size="sm"
        type="button"
        variant="link"
      >
        Use {category.name}
      </Button>
    </span>
  );
}

/** The expense's details, and the summary that adds it. */
export function ConfirmForm({
  receipt,
  people,
  onEditItems,
}: {
  onEditItems: () => void;
  people: readonly UserSummary[];
  receipt: Receipt;
}) {
  const { userId } = useHousehold();
  const form = useConfirmForm(receipt);
  const payers = people.map((user) => ({
    value: user.id,
    label: user.id === userId ? `${user.name} (you)` : user.name,
  }));
  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-6">
        <section
          aria-labelledby="expense-details"
          className="flex flex-col gap-4"
        >
          <h2 className="text-lg font-medium" id="expense-details">
            Expense
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="name">
              {(field) => <field.TextField autoComplete="off" label="Name" />}
            </form.AppField>
            <form.AppField name="expenseDate">
              {(field) => <field.DateField label="Date" />}
            </form.AppField>
            <form.AppField name="payerId">
              {(field) => <field.SelectField items={payers} label="Paid by" />}
            </form.AppField>
            <form.AppField name="categoryId">
              {(field) => (
                <field.CategoryField
                  description={
                    <ScanSuggestion
                      onUse={(categoryId) => field.handleChange(categoryId)}
                      suggestion={receipt.suggestedCategory}
                      value={field.state.value}
                    />
                  }
                  label="Category"
                />
              )}
            </form.AppField>
          </div>
        </section>
        <SplitSummary
          onEditItems={onEditItems}
          receipt={receipt}
          submit={(disabled) => (
            <>
              <form.FormError />
              <form.SubmitButton className="sm:self-end" disabled={disabled}>
                Add as expense
              </form.SubmitButton>
            </>
          )}
        />
      </form.Form>
    </form.AppForm>
  );
}
