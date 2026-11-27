"use client";

import { MAX_RECEIPT_ITEMS, type Receipt } from "@homesplit/contracts";
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import { useHouseholdId } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { invalidate } from "@/lib/api/queries";
import { receiptListKey, receiptQuery } from "@/lib/api/receipt-queries";
import { applyServerErrors, showServerErrors } from "@/lib/form";
import {
  type DraftTotals,
  differenceText,
  draftTotals,
  formatReceiptAmount,
  lineTotal,
  newItemValues,
  type ReceiptDraftValues,
  receiptDraftValues,
  toUpdateReceiptRequest,
  validateReceiptDraft,
} from "@/lib/receipts";

/** Why a save can't go through, for the codes a member can't fix in the form. */
const CONFLICT_MESSAGES: Record<string, string> = {
  RECEIPT_PROCESSING: "The receipt is being read again. Wait for it to finish.",
  RECEIPT_CONFIRMED: "This receipt was added as an expense in the meantime.",
};

function useReceiptForm(receipt: Receipt) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (values: ReceiptDraftValues) =>
      api("updateReceipt", {
        params: { householdId, receiptId: receipt.id },
        body: toUpdateReceiptRequest(values),
      }),
    onSettled: () => invalidate(queryClient, [receiptListKey(householdId)]),
  });
  const form = useAppForm({
    defaultValues: receiptDraftValues(receipt),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ({ value }) => validateReceiptDraft(value) },
    onSubmit: async ({ value, formApi }) => {
      let saved: Receipt;
      try {
        saved = await save.mutateAsync(value);
      } catch (error) {
        const conflict =
          isApiRequestError(error) && CONFLICT_MESSAGES[error.code];
        if (conflict) {
          showServerErrors(formApi, { fields: {}, form: conflict });
          await invalidate(queryClient, [
            receiptQuery(householdId, receipt.id).queryKey,
          ]);
        } else {
          applyServerErrors(formApi, error);
        }
        return;
      }
      queryClient.setQueryData(
        receiptQuery(householdId, receipt.id).queryKey,
        saved
      );
      formApi.reset(receiptDraftValues(saved));
      toast.success("Draft saved.");
    },
  });
  return form;
}

type ReceiptForm = ReturnType<typeof useReceiptForm>;

/**
 * The draft's header and items, all as typed until saved. The line total
 * follows the quantity, unit price, and discount, and the summary below
 * always says whether the items add up to the receipt's total.
 */
export function ReceiptDraftForm({ receipt }: { receipt: Receipt }) {
  const form = useReceiptForm(receipt);
  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-6">
        <HeaderFields form={form} />
        <ItemsField form={form} />
        <DraftSummary form={form} />
      </form.Form>
    </form.AppForm>
  );
}

function HeaderFields({ form }: { form: ReceiptForm }) {
  const currency = useStore(form.store, (state) => state.values.currency);
  return (
    <section aria-labelledby="receipt-details" className="flex flex-col gap-4">
      <h2 className="text-lg font-medium" id="receipt-details">
        Details
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="merchant">
          {(field) => <field.TextField autoComplete="off" label="Shop" />}
        </form.AppField>
        <form.AppField name="purchasedOn">
          {(field) => <field.DateField label="Date" />}
        </form.AppField>
        <form.AppField name="currency">
          {(field) => <field.CurrencyField label="Currency" />}
        </form.AppField>
        <form.AppField name="total">
          {(field) => (
            <field.MoneyField
              currency={currency || "–"}
              description="What was paid, as printed."
              label="Total"
            />
          )}
        </form.AppField>
        <form.AppField name="discount">
          {(field) => (
            <field.MoneyField
              currency={currency || "–"}
              description="Discounts on the whole receipt, and returned deposits such as bottle refunds."
              label="Receipt discount"
            />
          )}
        </form.AppField>
      </div>
    </section>
  );
}

function ItemsField({ form }: { form: ReceiptForm }) {
  return (
    <form.Field mode="array" name="items">
      {(items) => {
        const count = items.state.value.length;
        return (
          <section
            aria-labelledby="receipt-items"
            className="flex flex-col gap-3"
          >
            <h2 className="text-lg font-medium" id="receipt-items">
              Items ({count})
            </h2>
            {count === 0 ? (
              <p className="text-muted-foreground text-sm">
                No items yet. Add each line of the receipt.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {items.state.value.map((item, index) => (
                  <ItemRow
                    count={count}
                    form={form}
                    index={index}
                    key={item.key}
                    onMove={(to) => items.moveValue(index, to)}
                    onRemove={() => items.removeValue(index)}
                  />
                ))}
              </ol>
            )}
            <Button
              className="self-start"
              disabled={count >= MAX_RECEIPT_ITEMS}
              onClick={() => items.pushValue(newItemValues())}
              type="button"
              variant="outline"
            >
              <PlusIcon aria-hidden data-icon="inline-start" />
              Add item
            </Button>
          </section>
        );
      }}
    </form.Field>
  );
}

interface ItemRowProps {
  count: number;
  form: ReceiptForm;
  index: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}

function ItemRow({ form, index, count, onMove, onRemove }: ItemRowProps) {
  const currency = useStore(form.store, (state) => state.values.currency);
  const name = useStore(
    form.store,
    (state) => state.values.items[index]?.name ?? ""
  );
  const label = name.trim() || `item ${index + 1}`;
  /** Keeps the line total in step with what it's made of. */
  const updateTotal = () => {
    const item = form.getFieldValue(`items[${index}]`);
    const total = item ? lineTotal(item, currency) : null;
    if (total !== null) {
      form.setFieldValue(`items[${index}].total`, total);
    }
  };
  const money = currency || "–";

  return (
    <li>
      <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
        <legend className="sr-only">Item {index + 1}</legend>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <form.AppField name={`items[${index}].name`}>
              {(field) => <field.TextField autoComplete="off" label="Name" />}
            </form.AppField>
          </div>
          <div className="flex shrink-0 gap-1 pt-6">
            <Button
              aria-label={`Move ${label} up`}
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              aria-label={`Move ${label} down`}
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowDownIcon aria-hidden />
            </Button>
            <Button
              aria-label={`Remove ${label}`}
              onClick={onRemove}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon aria-hidden />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <form.AppField
            listeners={{ onChange: updateTotal }}
            name={`items[${index}].quantity`}
          >
            {(field) => (
              <field.TextField
                autoComplete="off"
                inputMode="decimal"
                label="Quantity"
              />
            )}
          </form.AppField>
          <form.AppField
            listeners={{ onChange: updateTotal }}
            name={`items[${index}].unitPrice`}
          >
            {(field) => (
              <field.MoneyField currency={money} label="Unit price" />
            )}
          </form.AppField>
          <form.AppField
            listeners={{ onChange: updateTotal }}
            name={`items[${index}].discount`}
          >
            {(field) => <field.MoneyField currency={money} label="Discount" />}
          </form.AppField>
          <form.AppField name={`items[${index}].total`}>
            {(field) => <field.MoneyField currency={money} label="Total" />}
          </form.AppField>
        </div>
      </fieldset>
    </li>
  );
}

/**
 * The items' sum next to the receipt's total, with the difference in words,
 * kept in view at the bottom of the screen with the save button.
 */
function DraftSummary({ form }: { form: ReceiptForm }) {
  const values = useStore(form.store, (state) => state.values);
  const totals = draftTotals(values);
  const currency = values.currency || null;
  return (
    <section
      aria-label="Summary"
      className="bg-background sticky bottom-0 -mx-4 flex flex-col gap-3 border-t px-4 py-3 sm:mx-0 sm:rounded-xl sm:border"
    >
      <SummaryLines currency={currency} totals={totals} />
      <form.FormError />
      <form.SubmitButton className="sm:self-end">Save draft</form.SubmitButton>
    </section>
  );
}

function SummaryLines({
  totals,
  currency,
}: {
  currency: string | null;
  totals: DraftTotals;
}) {
  const matches = totals.differenceCents === 0;
  const Icon = matches ? CircleCheckIcon : CircleAlertIcon;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Items</dt>
        <dd>{formatReceiptAmount(totals.itemsCents, currency)}</dd>
        {totals.discountCents > 0 ? (
          <>
            <dt className="text-muted-foreground">Receipt discount</dt>
            <dd>−{formatReceiptAmount(totals.discountCents, currency)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Total</dt>
        <dd>
          {totals.totalCents === null
            ? "–"
            : formatReceiptAmount(totals.totalCents, currency)}
        </dd>
      </dl>
      <p
        aria-live="polite"
        className={cn(
          "flex items-start gap-1.5 font-medium",
          !matches && "text-destructive"
        )}
      >
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {differenceText(totals.differenceCents, currency)}
      </p>
      {totals.invalidItems > 0 ? (
        <p className="text-muted-foreground">
          {totals.invalidItems === 1
            ? "1 item isn't counted until its total is a valid amount."
            : `${totals.invalidItems} items aren't counted until their totals are valid amounts.`}
        </p>
      ) : null}
    </div>
  );
}
