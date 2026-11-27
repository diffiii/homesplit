"use client";

import type { Receipt } from "@homesplit/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  ArrowLeftIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleIcon,
  Loader2Icon,
  PencilIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import {
  useFeatureEnabled,
  useHouseholdId,
  useUserName,
} from "@/components/shell/household-context";
import { receiptsPath } from "@/components/shell/household-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate } from "@/lib/api/queries";
import { receiptListKey, receiptQuery } from "@/lib/api/receipt-queries";
import { formatRelativeTime } from "@/lib/dates";
import {
  failureMessage,
  formatReceiptAmount,
  RECEIPT_STATUS_LABELS,
  receiptTitle,
} from "@/lib/receipts";
import { ReceiptDraftForm } from "./receipt-draft-form";

/**
 * One scanned receipt: the wait while it's read, what went wrong when it
 * couldn't be, and the draft to check and fix once it's there.
 */
export function ReceiptScreen() {
  const householdId = useHouseholdId();
  const { receiptId } = useParams<{ receiptId: string }>();
  const query = useQuery(receiptQuery(householdId, receiptId));
  return (
    <>
      <Link
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "self-start"
        )}
        href={receiptsPath(householdId)}
      >
        <ArrowLeftIcon aria-hidden data-icon="inline-start" />
        Receipts
      </Link>
      <QueryState
        errorTitle="Couldn't load the receipt"
        query={query}
        skeleton={<ReceiptSkeleton />}
      >
        {(receipt) => <ReceiptContent receipt={receipt} />}
      </QueryState>
    </>
  );
}

function ReceiptSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the receipt"
      className="flex flex-col gap-4"
      role="status"
    >
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function ReceiptContent({ receipt }: { receipt: Receipt }) {
  const enabled = useFeatureEnabled("expenses");
  const userName = useUserName();
  const editable = enabled && receipt.status !== "confirmed";
  return (
    <>
      <PageHeader
        actions={editable ? <DiscardButton receipt={receipt} /> : null}
        description={`${RECEIPT_STATUS_LABELS[receipt.status]} · Scanned by ${userName(receipt.createdBy)} ${formatRelativeTime(receipt.createdAt)}`}
        title={receiptTitle(receipt)}
      />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      <ReceiptBody editable={editable} receipt={receipt} />
    </>
  );
}

function ReceiptBody({
  receipt,
  editable,
}: {
  editable: boolean;
  receipt: Receipt;
}): ReactNode {
  switch (receipt.status) {
    case "processing":
      return <ReadingState receipt={receipt} />;
    case "failed":
      return <FailedState editable={editable} receipt={receipt} />;
    case "confirmed":
      return <ConfirmedState receipt={receipt} />;
    default:
      return editable ? (
        <ReceiptDraftForm key={receipt.id} receipt={receipt} />
      ) : (
        <ReadOnlyItems receipt={receipt} />
      );
  }
}

/** Seconds since `since`, counted up every second. */
function useSecondsSince(since: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
}

const READING_STEPS = [
  "Photo uploaded",
  "Reading the items",
  "Draft ready to check",
] as const;

/** Where the scan is, step by step, while the model reads the receipt. */
function ReadingState({ receipt }: { receipt: Receipt }) {
  const seconds = useSecondsSince(receipt.updatedAt);
  return (
    <section
      aria-labelledby="reading-title"
      className="flex flex-col gap-4 rounded-xl border p-6"
    >
      <div className="flex flex-col gap-1">
        <div role="status">
          <h2 className="font-medium" id="reading-title">
            Reading the receipt…
          </h2>
        </div>
        <p className="text-muted-foreground text-sm">
          This usually takes a few seconds ({seconds} s so far). You can leave
          this page: the draft will wait under Receipts.
        </p>
      </div>
      <ol className="flex flex-col gap-2 text-sm">
        {READING_STEPS.map((step, index) => (
          <li className="flex items-center gap-2" key={step}>
            <StepIcon index={index} />
            <span className={cn(index > 1 && "text-muted-foreground")}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ index }: { index: number }) {
  if (index === 0) {
    return <CircleCheckIcon aria-hidden className="text-primary size-4" />;
  }
  if (index === 1) {
    return <Loader2Icon aria-hidden className="size-4 animate-spin" />;
  }
  return <CircleIcon aria-hidden className="text-muted-foreground size-4" />;
}

/** Why reading failed, with a retry and the way to type the receipt in. */
function FailedState({
  receipt,
  editable,
}: {
  editable: boolean;
  receipt: Receipt;
}) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const ai = useFeatureEnabled("ai");
  const [byHand, setByHand] = useState(false);
  const retry = useMutation({
    mutationFn: () =>
      api("retryReceipt", {
        params: { householdId, receiptId: receipt.id },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        receiptQuery(householdId, receipt.id).queryKey,
        updated
      );
    },
    onSettled: () => invalidate(queryClient, [receiptListKey(householdId)]),
  });

  return (
    <>
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden />
        <AlertTitle>Couldn't read this receipt</AlertTitle>
        <AlertDescription>
          {failureMessage(receipt.failureCode)} Try again, or fill it in by
          hand.
        </AlertDescription>
      </Alert>
      {retry.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage(retry.error)}
        </p>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!ai || retry.isPending}
            onClick={() => retry.mutate()}
            type="button"
          >
            {retry.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RotateCwIcon aria-hidden data-icon="inline-start" />
            )}
            Try again
          </Button>
          {byHand ? null : (
            <Button
              onClick={() => setByHand(true)}
              type="button"
              variant="outline"
            >
              <PencilIcon aria-hidden data-icon="inline-start" />
              Fill in by hand
            </Button>
          )}
        </div>
      ) : null}
      {editable && byHand ? (
        <ReceiptDraftForm key={receipt.id} receipt={receipt} />
      ) : null}
    </>
  );
}

function ConfirmedState({ receipt }: { receipt: Receipt }) {
  return (
    <>
      <Alert>
        <CircleCheckIcon aria-hidden />
        <AlertTitle>Added as an expense</AlertTitle>
        <AlertDescription>
          This receipt can't be changed any more.
        </AlertDescription>
      </Alert>
      <ReadOnlyItems receipt={receipt} />
    </>
  );
}

/** The items as read, for a receipt that can't be edited. */
function ReadOnlyItems({ receipt }: { receipt: Receipt }) {
  const amount = (cents: number) =>
    formatReceiptAmount(cents, receipt.currency);
  return (
    <ul aria-label="Items" className="flex flex-col divide-y rounded-xl border">
      {receipt.items.map((item) => (
        <li className="flex items-center gap-3 px-4 py-3" key={item.id}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{item.name}</span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {item.quantity} × {amount(item.unitPriceCents)}
            </span>
          </span>
          <span className="font-medium tabular-nums">
            {amount(item.totalCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Deletes the draft; the photo stays as a household file until cleanup. */
function DiscardButton({ receipt }: { receipt: Receipt }) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const router = useRouter();
  return (
    <ConfirmDialog
      confirmLabel="Discard"
      describeError={(error) =>
        isApiRequestError(error) && error.code === "RECEIPT_CONFIRMED"
          ? "This receipt was added as an expense in the meantime."
          : errorMessage(error)
      }
      description="The draft and everything typed into it are deleted. This can't be undone."
      destructive
      onConfirm={async () => {
        await api("deleteReceipt", {
          params: { householdId, receiptId: receipt.id },
        });
        await invalidate(queryClient, [receiptListKey(householdId)]);
        router.push(receiptsPath(householdId));
      }}
      title="Discard this receipt?"
      trigger={
        <Button type="button" variant="outline">
          <Trash2Icon aria-hidden data-icon="inline-start" />
          Discard
        </Button>
      }
    />
  );
}
