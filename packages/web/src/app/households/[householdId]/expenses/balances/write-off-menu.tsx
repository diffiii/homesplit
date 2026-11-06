"use client";

import type { MemberBalance } from "@homesplit/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useHousehold,
  useHouseholdId,
} from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { settlementQueryKeys } from "@/lib/api/expense-queries";
import { invalidate } from "@/lib/api/queries";
import { formatMoney } from "@/lib/money";
import {
  forgivePayments,
  type PlannedPayment,
  splitPayments,
  WRITE_OFF_NOTE,
} from "@/lib/settlements";
import { useMemberSummaries } from "../expense-form";

type Method = "forgive" | "split" | "finish";

/** Admins settle a departed member's balance, as "Writing off debts" in docs/decisions.md describes. */
export function WriteOffMenu({
  subject,
  balances,
  currency,
}: {
  balances: readonly MemberBalance[];
  currency: string;
  subject: MemberBalance;
}) {
  const [method, setMethod] = useState<Method | null>(null);
  // What a partly failed write-off still has to record. It outlives the dialog,
  // because working the payments out again from the new balance would share the
  // rest among members who already took their share.
  const [unfinished, setUnfinished] = useState<PlannedPayment[] | null>(null);
  const { name } = subject.user;
  const owes = subject.amountCents < 0;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Write off ${name}'s balance in ${currency}`}
              size="sm"
              variant="outline"
            />
          }
        >
          Write off
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {unfinished ? (
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setMethod("finish")}>
                Finish the write-off ({unfinished.length} left)
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setMethod("forgive")}>
                {owes
                  ? "Forgive: those owed take the loss"
                  : "Forgive: those who owe are let off"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMethod("split")}>
                Split equally among current members
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {method ? (
        <WriteOffDialog
          balances={balances}
          currency={currency}
          method={method}
          onClose={() => setMethod(null)}
          onUnfinished={setUnfinished}
          subject={subject}
          unfinished={unfinished}
        />
      ) : null}
    </>
  );
}

function WriteOffDialog({
  subject,
  balances,
  currency,
  method,
  onClose,
  onUnfinished,
  unfinished,
}: {
  balances: readonly MemberBalance[];
  currency: string;
  method: Method;
  onClose: () => void;
  onUnfinished: (payments: PlannedPayment[] | null) => void;
  subject: MemberBalance;
  unfinished: PlannedPayment[] | null;
}) {
  const householdId = useHouseholdId();
  const { userId } = useHousehold();
  const members = useMemberSummaries();
  const queryClient = useQueryClient();
  const recorded = useRef({ done: 0, total: 0 });

  const plan = () =>
    method === "forgive"
      ? forgivePayments(subject, balances)
      : splitPayments(subject, members);
  // The user's own payment stays pending and doesn't move the balance, so it
  // goes last.
  const isPending = ({ payer }: PlannedPayment) => payer.id === userId;
  const payments = [...(unfinished ?? plan())].sort(
    (a, b) => Number(isPending(a)) - Number(isPending(b))
  );

  const { name } = subject.user;
  const amount = formatMoney({
    amountCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
    currency,
  });

  const record = async () => {
    recorded.current = { done: 0, total: payments.length };
    try {
      for (const { payer, payee, amountCents } of payments) {
        // biome-ignore lint/performance/noAwaitInLoops: one at a time, to stop at the first failure and say how far it got.
        await api("processSettlement", {
          params: { householdId },
          body: {
            payerId: payer.id,
            payeeId: payee.id,
            amount: { amountCents, currency },
            note: WRITE_OFF_NOTE,
          },
        });
        recorded.current.done += 1;
      }
    } catch (error) {
      if (recorded.current.done > 0) {
        onUnfinished(payments.slice(recorded.current.done));
      }
      throw error;
    } finally {
      await invalidate(queryClient, settlementQueryKeys(householdId));
    }
    onUnfinished(null);
    toast.success(`${name}'s balance in ${currency} was written off.`);
  };

  return (
    <ConfirmDialog
      confirmDisabled={payments.length === 0}
      confirmLabel="Write off"
      describeError={(error) => {
        const { done, total } = recorded.current;
        return done > 0
          ? `${done} of ${total} payments were recorded before this failed. ${errorMessage(error)} The rest are listed above, unchanged, so try again to record them.`
          : errorMessage(error);
      }}
      description={`Payments confirmed this way can't be deleted. They look like any other payment in the history, with the note “${WRITE_OFF_NOTE}”.`}
      destructive
      onConfirm={record}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={
        subject.amountCents < 0
          ? `Write off ${name}'s debt of ${amount}?`
          : `Write off the ${amount} ${name} is owed?`
      }
    >
      <ul
        aria-label="Payments to record"
        className="flex flex-col divide-y rounded-xl border text-sm"
      >
        {payments.map((payment) => (
          <li
            className="flex flex-col gap-0.5 px-3 py-2"
            key={`${payment.payer.id}-${payment.payee.id}`}
          >
            <span className="flex flex-wrap justify-between gap-x-3">
              <span>
                {payment.payer.name} → {payment.payee.name}
              </span>
              <span className="font-medium tabular-nums">
                {formatMoney({ amountCents: payment.amountCents, currency })}
              </span>
            </span>
            {isPending(payment) ? (
              <span className="text-muted-foreground">
                You're the payer, so this one waits for another admin to confirm
                it.
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
