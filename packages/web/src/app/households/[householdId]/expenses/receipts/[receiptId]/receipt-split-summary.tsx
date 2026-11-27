"use client";

import type { Receipt, ReceiptSplit } from "@homesplit/contracts";
import {
  keepPreviousData,
  useIsMutating,
  useQuery,
} from "@tanstack/react-query";
import { cn } from "cn";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useHousehold } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { UserLabel } from "@/components/user-avatar";
import { errorMessage } from "@/lib/api/error-message";
import { receiptAssignKey, receiptSplitQuery } from "@/lib/api/receipt-queries";
import { confirmReadiness } from "@/lib/receipt-assignment";
import { differenceText, formatReceiptAmount } from "@/lib/receipts";

/**
 * Each person's part as the API works it out, what's still unassigned, and
 * whether the items add up, kept in view at the bottom with the button that
 * adds the expense.
 */
export function SplitSummary({
  receipt,
  onEditItems,
  submit,
}: {
  onEditItems: () => void;
  receipt: Receipt;
  /** The form's error and submit button, disabled until the receipt can be confirmed. */
  submit: (disabled: boolean) => ReactNode;
}) {
  const { household, userId } = useHousehold();
  const split = useQuery({
    ...receiptSplitQuery(household.id, receipt.id),
    placeholderData: keepPreviousData,
  });
  const saving =
    useIsMutating({ mutationKey: receiptAssignKey(household.id, receipt.id) }) >
    0;
  const { data } = split;
  const readiness = data ? confirmReadiness(receipt, data) : null;
  const settled = !(saving || split.isFetching);
  return (
    <section
      aria-label="Split"
      className="bg-background sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] -mx-4 flex flex-col gap-3 border-t px-4 py-3 sm:mx-0 sm:rounded-xl sm:border md:bottom-0"
    >
      {data ? (
        <SplitLines currency={receipt.currency} split={data} userId={userId} />
      ) : (
        <p className="text-muted-foreground text-sm">
          {split.isError
            ? `Couldn't work out the split. ${errorMessage(split.error)}`
            : "Working out the split…"}
        </p>
      )}
      {readiness && !readiness.ok ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <p className="text-muted-foreground">{readiness.text}</p>
          {readiness.reason === "unassigned" ? null : (
            <Button
              onClick={onEditItems}
              size="sm"
              type="button"
              variant="link"
            >
              Edit items
            </Button>
          )}
        </div>
      ) : null}
      {submit(!(readiness?.ok && settled))}
    </section>
  );
}

function SplitLines({
  split,
  currency,
  userId,
}: {
  currency: string | null;
  split: ReceiptSplit;
  userId: string;
}) {
  const amount = (cents: number) => formatReceiptAmount(cents, currency);
  const matches = split.differenceCents === 0;
  const Icon = matches ? CircleCheckIcon : CircleAlertIcon;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {split.people.length > 0 ? (
        <ul aria-label="Each person's part" className="flex flex-col gap-1.5">
          {split.people.map(({ user, amountCents }) => (
            <li
              className="flex items-center justify-between gap-3"
              key={user.id}
            >
              <UserLabel size="sm" user={user} you={user.id === userId} />
              <span className="font-medium tabular-nums">
                {amount(amountCents)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Unassigned</dt>
        <dd className={cn(split.unassignedCents !== 0 && "font-medium")}>
          {amount(split.unassignedCents)}
        </dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd>{amount(split.totalCents)}</dd>
      </dl>
      <p
        aria-live="polite"
        className={cn(
          "flex items-start gap-1.5 font-medium",
          !matches && "text-destructive"
        )}
      >
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {differenceText(split.differenceCents, currency)}
      </p>
    </div>
  );
}
