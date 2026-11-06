"use client";

import type { UserSummary } from "@homesplit/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import {
  useHousehold,
  useHouseholdId,
  useIsDeparted,
  usePermissions,
} from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { settlementQueryKeys } from "@/lib/api/expense-queries";
import { endpointQuery, invalidate } from "@/lib/api/queries";
import { applyServerErrors } from "@/lib/form";
import { toDecimalString } from "@/lib/money";
import { readLastExpenseCurrency } from "@/lib/recent-currencies";
import { PaymentFormValues, toPaymentRequest } from "@/lib/settlements";
import { useMemberSummaries } from "../expense-form";

/** A suggested payment to start from. */
export interface PaymentPrefill {
  amountCents: number;
  currency: string;
  payeeId: string;
  payerId: string;
}

/**
 * Who a payment can involve: current members, the user first, then people who
 * left with a balance. The API lists no other departed members.
 */
export function useParties(): UserSummary[] {
  const householdId = useHouseholdId();
  const members = useMemberSummaries();
  const isDeparted = useIsDeparted();
  const balances = useQuery(
    endpointQuery("listBalances", { params: { householdId } })
  );
  const departed = new Map<string, UserSummary>();
  for (const { balances: rows } of balances.data?.items ?? []) {
    for (const { user } of rows) {
      if (isDeparted(user)) {
        departed.set(user.id, user);
      }
    }
  }
  return [
    ...members,
    ...[...departed.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "en")
    ),
  ];
}

export function PaymentDialog({
  finalFocus,
  onOpenChange,
  onRecorded,
  open,
  prefill,
}: {
  finalFocus?: ComponentProps<typeof ResponsiveDialogContent>["finalFocus"];
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
  open: boolean;
  prefill?: PaymentPrefill;
}) {
  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent finalFocus={finalFocus}>
        {/* Mounted only while open, so every opening starts from fresh values. */}
        <PaymentForm onRecorded={onRecorded} prefill={prefill} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function PaymentForm({
  prefill,
  onRecorded,
}: {
  onRecorded: () => void;
  prefill?: PaymentPrefill;
}) {
  const { household, role, userId } = useHousehold();
  const householdId = household.id;
  const queryClient = useQueryClient();
  const can = usePermissions();
  const isDeparted = useIsDeparted();
  const parties = useParties();
  const balances = useQuery(
    endpointQuery("listBalances", { params: { householdId } })
  );

  // The form only offers payments the user may record.
  const payeesFor = (payerId: string) =>
    parties.filter(
      (party) =>
        party.id !== payerId &&
        can.recordPayment({ payer: { id: payerId }, payee: party })
    );
  const label = (party: UserSummary) => {
    if (party.id === userId) {
      return `${party.name} (you)`;
    }
    return isDeparted(party) ? `${party.name} (left)` : party.name;
  };
  const toItems = (people: readonly UserSummary[]) =>
    people.map((party) => ({ label: label(party), value: party.id }));

  const currency =
    prefill?.currency ??
    balances.data?.items[0]?.currency ??
    readLastExpenseCurrency(householdId);
  const defaultValues: PaymentFormValues = {
    payerId: prefill?.payerId ?? userId,
    payeeId: prefill?.payeeId ?? payeesFor(userId)[0]?.id ?? "",
    amount: prefill ? toDecimalString(prefill.amountCents, currency) : "",
    currency,
    note: "",
  };

  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: PaymentFormValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        await api("processSettlement", {
          params: { householdId },
          body: toPaymentRequest(value),
        });
      } catch (error) {
        applyServerErrors(formApi, error);
        return;
      }
      await invalidate(queryClient, settlementQueryKeys(householdId));
      toast.success(
        value.payerId === userId
          ? "Payment recorded. It's waiting to be confirmed."
          : "Payment recorded."
      );
      onRecorded();
    },
  });

  return (
    <form.AppForm>
      <form.Form className="contents">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Record a payment</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            For money that has already changed hands. HomeSplit doesn't move any
            money itself.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <form.AppField
            listeners={{
              // Keep the payee one this payer can be recorded paying.
              onChange: ({ value }) => {
                const payees = payeesFor(value);
                const payeeId = form.getFieldValue("payeeId");
                if (!payees.some(({ id }) => id === payeeId)) {
                  form.setFieldValue("payeeId", payees[0]?.id ?? "");
                }
              },
            }}
            name="payerId"
          >
            {(field) => (
              <field.SelectField items={toItems(parties)} label="Who paid" />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.payerId}>
            {(payerId) => (
              <form.AppField name="payeeId">
                {(field) => (
                  <field.SelectField
                    items={toItems(payeesFor(payerId))}
                    label="Who got paid"
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Subscribe selector={(state) => state.values.currency}>
              {(selected) => (
                <form.AppField name="amount">
                  {(field) => (
                    <field.MoneyField currency={selected} label="Amount" />
                  )}
                </form.AppField>
              )}
            </form.Subscribe>
            <form.AppField name="currency">
              {(field) => <field.CurrencyField label="Currency" />}
            </form.AppField>
          </div>
          <form.AppField name="note">
            {(field) => (
              <field.TextField
                autoComplete="off"
                label="Note (optional)"
                placeholder="BLIK"
              />
            )}
          </form.AppField>
          <form.Subscribe
            selector={({ values: { payerId, payeeId } }) => ({
              payerId,
              payeeId,
            })}
          >
            {({ payerId, payeeId }) => (
              <p aria-live="polite" className="text-muted-foreground text-sm">
                {describeOutcome(
                  payerId === userId,
                  parties.find(({ id }) => id === payeeId),
                  isDeparted,
                  role === "member" ? "an admin" : "another admin"
                )}
              </p>
            )}
          </form.Subscribe>
          <form.FormError />
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            Cancel
          </ResponsiveDialogClose>
          <form.SubmitButton>Record payment</form.SubmitButton>
        </ResponsiveDialogFooter>
      </form.Form>
    </form.AppForm>
  );
}

/** A payment recorded by its payer waits; any other counts right away. */
function describeOutcome(
  recordedByPayer: boolean,
  payee: UserSummary | undefined,
  isDeparted: (user: UserSummary) => boolean,
  admin: string
): string {
  if (!recordedByPayer) {
    return "It's confirmed right away, because you aren't the one who paid.";
  }
  const confirmer =
    payee && !isDeparted(payee) ? `${payee.name} or ${admin}` : admin;
  return `It stays pending until ${confirmer} confirms it, and balances don't change until then.`;
}
