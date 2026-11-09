"use client";

import {
  type MemberBalance,
  type PlannedPayment,
  planWriteOff,
  type UserSummary,
  WRITE_OFF_NOTE,
  type WriteOffMethod,
} from "@homesplit/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useHouseholdId } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { settlementQueryKeys } from "@/lib/api/expense-queries";
import { householdQueries } from "@/lib/api/household-queries";
import { endpointQuery, invalidate } from "@/lib/api/queries";
import { formatMoney } from "@/lib/money";
import { useMemberSummaries } from "../expense-form";

/** Whose balance, in which currency, and how. */
interface WriteOff {
  currency: string;
  method: WriteOffMethod;
  subject: UserSummary;
}

export type StartWriteOff = (
  opener: HTMLElement | null,
  writeOff: WriteOff
) => void;

/**
 * One write-off dialog for the page, since recording one refetches the
 * balances and removes the row it was opened from. Cancelling returns focus to
 * the row's button; on success focus goes to `fallbackFocus`.
 */
export function useWriteOffs(fallbackFocus: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  const [writeOff, setWriteOff] = useState<WriteOff | null>(null);

  let dialog: ReactNode = null;
  if (writeOff) {
    dialog = (
      <WriteOffDialog
        {...writeOff}
        finalFocus={() =>
          opener.current?.isConnected
            ? opener.current
            : // The fallback is gone too once nobody else is left to pay.
              (fallbackFocus.current ??
              document.querySelector<HTMLElement>("#main"))
        }
        onClose={() => setWriteOff(null)}
        onRecorded={() => {
          opener.current = null;
        }}
      />
    );
  }

  const start: StartWriteOff = (from, next) => {
    opener.current = from;
    setWriteOff(next);
  };
  return { start, dialog };
}

/** Admins settle a departed member's balance, as "Writing off debts" in docs/decisions.md describes. */
export function WriteOffMenu({
  subject,
  currency,
  onStart,
}: {
  currency: string;
  onStart: StartWriteOff;
  subject: MemberBalance;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const { name } = subject.user;
  const begin = (method: WriteOffMethod) =>
    onStart(trigger.current, { subject: subject.user, currency, method });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Write off ${name}'s balance in ${currency}`}
            ref={trigger}
            size="sm"
            variant="outline"
          />
        }
      >
        Write off
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => begin("forgive")}>
            {subject.amountCents < 0
              ? "Forgive: those owed take the loss"
              : "Forgive: those who owe are let off"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => begin("split")}>
            Split equally among current members
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WriteOffDialog({
  subject,
  currency,
  method,
  finalFocus,
  onClose,
  onRecorded,
}: WriteOff & {
  finalFocus: () => HTMLElement | null;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const members = useMemberSummaries();
  // Refetched on opening, so the payments shown are the ones the server plans.
  const balances = useQuery({
    ...endpointQuery("listBalances", { params: { householdId } }),
    refetchOnMount: "always",
  });
  const household = useQuery({
    ...householdQueries.get(householdId),
    refetchOnMount: "always",
  });

  const group =
    balances.data?.items.find((item) => item.currency === currency)?.balances ??
    [];
  const balance = group.find(({ user }) => user.id === subject.id) ?? {
    user: subject,
    amountCents: 0,
  };
  // Only a departed member's balance can be written off.
  const rejoined = members.some(({ id }) => id === subject.id);
  // What was sent, held while the refetches after it change the balance.
  const [sent, setSent] = useState<PlannedPayment[] | null>(null);
  const planned = rejoined ? [] : planWriteOff(method, balance, group, members);
  const payments = sent ?? planned;
  const { name } = subject;
  const refreshFailed = balances.isError || household.isError;

  const record = async () => {
    setSent(payments);
    // After a failure too, so a changed balance shows its new payments, and
    // a member who rejoined stops showing as departed.
    const refresh = () =>
      invalidate(queryClient, [
        ...settlementQueryKeys(householdId),
        householdQueries.get(householdId).queryKey,
      ]);
    try {
      await api("writeOffBalance", {
        params: { householdId },
        body: {
          userId: subject.id,
          currency,
          method,
          amountCents: balance.amountCents,
        },
      });
    } catch (error) {
      setSent(null);
      // Not awaited, so a stalled refetch doesn't hold up the error.
      refresh();
      throw error;
    }
    await refresh();
    onRecorded();
    toast.success(`${name}'s balance in ${currency} was written off.`);
  };

  return (
    <ConfirmDialog
      confirmDisabled={
        payments.length === 0 ||
        refreshFailed ||
        balances.isFetching ||
        household.isFetching
      }
      confirmLabel="Write off"
      describeError={(error) => describeFailure(error, name, currency)}
      description={`Payments confirmed this way can't be deleted. They look like any other payment in the history, with the note “${WRITE_OFF_NOTE}”.`}
      destructive
      finalFocus={finalFocus}
      onConfirm={record}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={`Write off ${name}'s balance in ${currency}?`}
    >
      {balance.amountCents === 0 && !balances.isFetching && !sent ? (
        <p className="text-muted-foreground text-sm">
          {name} is settled up in {currency}, so there's nothing to write off.
        </p>
      ) : null}
      {payments.length > 0 ? (
        <ul
          aria-label="Payments to record"
          className="flex flex-col divide-y rounded-xl border text-sm"
        >
          {payments.map((payment) => (
            <li
              className="flex flex-wrap justify-between gap-x-3 px-3 py-2"
              key={`${payment.payer.id}-${payment.payee.id}`}
            >
              <span>
                {payment.payer.name} → {payment.payee.name}
              </span>
              <span className="font-medium tabular-nums">
                {formatMoney({ amountCents: payment.amountCents, currency })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Mounted throughout, so a failure that turns up while it's open is announced. */}
      <p className="text-muted-foreground text-sm empty:sr-only" role="status">
        {refreshFailed
          ? "Couldn't refresh the balances and members, so this may be out of date."
          : null}
        {rejoined && !refreshFailed
          ? `${name} is a member again, so their balance can't be written off.`
          : null}
      </p>
    </ConfirmDialog>
  );
}

/** The server records all of a write-off or none of it, so trying again is safe. */
function describeFailure(error: unknown, name: string, currency: string) {
  if (isApiRequestError(error)) {
    switch (error.code) {
      case "BALANCE_CHANGED":
        return `${name}'s balance in ${currency} has changed, so nothing was recorded.`;
      case "HAS_PENDING_PAYMENTS":
        return `Payments with ${name} in ${currency} are pending, so nothing was recorded. Confirm or reject them first.`;
      case "MEMBER_NOT_DEPARTED":
        return `${name} is a member again, so their balance can't be written off.`;
      default:
        break;
    }
  }
  return errorMessage(error);
}
