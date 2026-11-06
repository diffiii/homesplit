"use client";

import type { Settlement } from "@homesplit/contracts";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptTextIcon } from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import {
  useFeatureEnabled,
  useHousehold,
  useHouseholdId,
  useIsDeparted,
  usePermissions,
  useWaitingPayments,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLoadMoreOnScroll } from "@/hooks/use-load-more-on-scroll";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import {
  settlementHistoryQuery,
  settlementQueryKeys,
} from "@/lib/api/expense-queries";
import { invalidate } from "@/lib/api/queries";
import { formatLocalDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { describePayment } from "@/lib/settlements";

type ActionKind = "confirm" | "withdraw" | "reject";

type StartAction = (
  event: MouseEvent<HTMLElement>,
  kind: ActionKind,
  payment: Settlement
) => void;

const ACTION_TEXT: Record<
  ActionKind,
  { done: string; label: string; outcome: string; title: string }
> = {
  confirm: {
    label: "Confirm",
    title: "Confirm this payment?",
    outcome: "It counts toward balances right away, and can't be undone.",
    done: "Payment confirmed.",
  },
  withdraw: {
    label: "Withdraw",
    title: "Withdraw this payment?",
    outcome: "It's removed from the history, and balances don't change.",
    done: "Payment withdrawn.",
  },
  reject: {
    label: "Reject",
    title: "Reject this payment?",
    outcome: "It's removed from the history, and balances don't change.",
    done: "Payment rejected.",
  },
};

/**
 * One dialog for both lists, since acting on a payment refetches them and can
 * remove its row. Cancelling returns focus to the button that opened it; on
 * success focus goes to `fallbackFocus`, since that button may be about to go.
 */
export function usePaymentActions(
  fallbackFocus: RefObject<HTMLElement | null>
) {
  const householdId = useHouseholdId();
  const { userId } = useHousehold();
  const queryClient = useQueryClient();
  const opener = useRef<HTMLElement | null>(null);
  const [action, setAction] = useState<{
    kind: ActionKind;
    payment: Settlement;
  } | null>(null);

  const start: StartAction = (event, kind, payment) => {
    opener.current = event.currentTarget;
    setAction({ kind, payment });
  };

  let dialog: ReactNode = null;
  if (action) {
    const { kind, payment } = action;
    const params = { householdId, settlementId: payment.id };
    const text = ACTION_TEXT[kind];
    dialog = (
      <ConfirmDialog
        confirmLabel={text.label}
        describeError={describeActionError}
        description={`${describePayment(payment, userId)} ${formatMoney(payment.amount)}. ${text.outcome}`}
        destructive={kind !== "confirm"}
        finalFocus={() =>
          opener.current?.isConnected ? opener.current : fallbackFocus.current
        }
        onConfirm={async () => {
          try {
            await (kind === "confirm"
              ? api("confirmSettlement", { params })
              : api("deleteSettlement", { params }));
          } finally {
            // After a failure too: someone else has probably acted on it.
            await invalidate(queryClient, settlementQueryKeys(householdId));
          }
          opener.current = null;
          toast.success(text.done);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setAction(null);
          }
        }}
        open
        title={text.title}
      />
    );
  }
  return { start, dialog };
}

function describeActionError(error: unknown): string {
  return isApiRequestError(error) && error.code === "SETTLEMENT_CONFIRMED"
    ? "This payment has already been confirmed, so it can't be removed."
    : errorMessage(error);
}

/** What needs the user, above everything else on the page. */
export function WaitingPayments({ onAction }: { onAction: StartAction }) {
  const waiting = useWaitingPayments();
  if (waiting.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium" id="waiting-heading">
          Waiting for you
        </h2>
        <p className="text-muted-foreground text-sm">
          These don't count toward balances until they're confirmed.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {waiting.map((payment) => (
          <PaymentRow key={payment.id} onAction={onAction} payment={payment} />
        ))}
      </ul>
    </section>
  );
}

/** Every payment, newest first, loading more as the user scrolls. */
export function PaymentHistory({ onAction }: { onAction: StartAction }) {
  const householdId = useHouseholdId();
  const list = useInfiniteQuery(settlementHistoryQuery(householdId));
  const pages = list.data ? list.data.pages : null;
  const payments = useMemo(
    () => pages?.flatMap((page) => page.items) ?? [],
    [pages]
  );
  const totalItems = pages?.at(-1)?.totalItems ?? 0;
  const loadMore = useLoadMoreOnScroll(list);

  let content: ReactNode;
  if (!pages) {
    content =
      list.status === "error" ? (
        <ErrorState
          error={list.error}
          onRetry={list.refetch}
          retrying={list.isRefetching}
          title="Couldn't load payments"
        />
      ) : (
        <ListSkeleton label="Loading payments" rows={3} />
      );
  } else if (payments.length === 0) {
    content = (
      <EmptyState
        description="Payments between members show up here, newest first."
        icon={ReceiptTextIcon}
        title="No payments yet"
      />
    );
  } else {
    content = (
      <>
        <ul className="flex flex-col divide-y rounded-xl border">
          {payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              onAction={onAction}
              payment={payment}
            />
          ))}
        </ul>
        <div className="flex flex-col items-center gap-2">
          <p aria-live="polite" className="text-muted-foreground text-sm">
            Showing {payments.length} of {totalItems}{" "}
            {totalItems === 1 ? "payment" : "payments"}
          </p>
          {list.hasNextPage ? (
            <Button
              disabled={list.isFetchingNextPage}
              onClick={() => list.fetchNextPage()}
              ref={loadMore}
              variant="outline"
            >
              {list.isFetchingNextPage ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Load more
            </Button>
          ) : null}
          {list.isFetchNextPageError ? (
            <p className="text-destructive text-sm" role="alert">
              Couldn't load more payments. Try again.
            </p>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id="history-heading">
        Payment history
      </h2>
      {content}
    </section>
  );
}

function PaymentRow({
  payment,
  onAction,
}: {
  onAction: StartAction;
  payment: Settlement;
}) {
  const { userId } = useHousehold();
  const can = usePermissions();
  const enabled = useFeatureEnabled("expenses");
  const isDeparted = useIsDeparted();
  const { payer, payee, createdBy, createdAt, note, status } = payment;
  const summary = `${describePayment(payment, userId)} ${formatMoney(payment.amount)}`;
  const removal: ActionKind = payer.id === userId ? "withdraw" : "reject";

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          {describePayment(payment, userId)}
          {isDeparted(payer) || isDeparted(payee) ? (
            <Badge variant="outline">Left the household</Badge>
          ) : null}
        </span>
        <span className="ml-auto text-sm font-medium tabular-nums">
          {formatMoney(payment.amount)}
        </span>
      </div>
      {note ? <p className="text-sm wrap-anywhere">{note}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={status === "pending" ? "secondary" : "outline"}>
            {status === "pending" ? "Pending" : "Confirmed"}
          </Badge>
          <span className="text-muted-foreground text-sm">
            Recorded by {createdBy.id === userId ? "you" : createdBy.name} on{" "}
            {formatLocalDate(createdAt)}
          </span>
        </span>
        {enabled ? (
          <span className="ml-auto flex gap-2">
            {can.deletePayment(payment) ? (
              <Button
                aria-label={`${ACTION_TEXT[removal].label}: ${summary}`}
                onClick={(event) => onAction(event, removal, payment)}
                size="sm"
                variant="outline"
              >
                {ACTION_TEXT[removal].label}
              </Button>
            ) : null}
            {can.confirmPayment(payment) ? (
              <Button
                aria-label={`Confirm: ${summary}`}
                onClick={(event) => onAction(event, "confirm", payment)}
                size="sm"
              >
                Confirm
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </li>
  );
}
