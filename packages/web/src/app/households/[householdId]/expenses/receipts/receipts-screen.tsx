"use client";

import type { ReceiptSummary } from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ScanLineIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import {
  useFeatureEnabled,
  useHouseholdId,
  useUserName,
} from "@/components/shell/household-context";
import { receiptPath } from "@/components/shell/household-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { receiptListQuery } from "@/lib/api/receipt-queries";
import { formatIsoDate, formatRelativeTime } from "@/lib/dates";
import {
  formatReceiptAmount,
  RECEIPT_STATUS_LABELS,
  receiptTitle,
} from "@/lib/receipts";
import { ScanReceiptDialog } from "./scan-receipt-dialog";

/**
 * Receipts that aren't expenses yet, newest first, so a member can come back
 * to a draft, and the way to scan a new one.
 */
export function ReceiptsScreen() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const ai = useFeatureEnabled("ai");
  const list = useQuery(receiptListQuery(householdId));
  const scan = enabled ? <ScanReceiptDialog disabled={!ai} /> : null;

  return (
    <>
      <PageHeader
        actions={scan}
        description="Scanned receipts that aren't expenses yet. Check what was read and fix anything that's off."
        title="Receipts"
      />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      {enabled && !ai ? (
        <Alert>
          <SparklesIcon aria-hidden />
          <AlertTitle>Scanning needs AI</AlertTitle>
          <AlertDescription>
            AI is turned off for this household. An admin can turn it on in
            settings. Drafts you already have can still be edited.
          </AlertDescription>
        </Alert>
      ) : null}
      <QueryState
        errorTitle="Couldn't load receipts"
        query={list}
        skeleton={<ListSkeleton label="Loading receipts" />}
      >
        {({ items }) => {
          const drafts = items.filter(({ status }) => status !== "confirmed");
          return drafts.length > 0 ? (
            <ul
              aria-label="Receipt drafts"
              className="flex flex-col divide-y rounded-xl border"
            >
              {drafts.map((receipt) => (
                <ReceiptRow key={receipt.id} receipt={receipt} />
              ))}
            </ul>
          ) : (
            <EmptyState
              action={ai ? scan : null}
              description="Scan a receipt and HomeSplit reads its items into a draft you can check and fix."
              icon={ScanLineIcon}
              title="No receipt drafts"
            />
          );
        }}
      </QueryState>
    </>
  );
}

function ReceiptRow({ receipt }: { receipt: ReceiptSummary }) {
  const householdId = useHouseholdId();
  const userName = useUserName();
  const details = [
    receipt.purchasedOn ? formatIsoDate(receipt.purchasedOn) : null,
    `Scanned by ${userName(receipt.createdBy)} ${formatRelativeTime(receipt.createdAt)}`,
  ].filter(Boolean);
  return (
    <li>
      <Link
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-3 outline-none focus-visible:ring-3"
        href={receiptPath(householdId, receipt.id)}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{receiptTitle(receipt)}</span>
          <span className="text-muted-foreground truncate text-sm">
            {details.join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {receipt.totalCents === null ? null : (
            <span className="font-medium tabular-nums">
              {formatReceiptAmount(receipt.totalCents, receipt.currency)}
            </span>
          )}
          <Badge
            className={cn(receipt.status === "processing" && "animate-pulse")}
            variant={receipt.status === "failed" ? "destructive" : "secondary"}
          >
            {RECEIPT_STATUS_LABELS[receipt.status]}
          </Badge>
        </span>
      </Link>
    </li>
  );
}
