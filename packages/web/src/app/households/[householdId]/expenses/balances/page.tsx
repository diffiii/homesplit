"use client";

import type {
  CurrencyBalances,
  CurrencySettlementSuggestions,
  SettlementSuggestion,
} from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowLeftIcon, CircleCheckIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import {
  useFeatureEnabled,
  useHousehold,
  useHouseholdId,
  useIsDeparted,
  usePermissions,
} from "@/components/shell/household-context";
import { householdPath } from "@/components/shell/household-nav";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { UserLabel } from "@/components/user-avatar";
import { endpointQuery } from "@/lib/api/queries";
import { currencyName, formatMoney } from "@/lib/money";
import { describeBalance, describeTransfer } from "@/lib/settlements";
import {
  PaymentDialog,
  type PaymentPrefill,
  useParties,
} from "./payment-dialog";

type StartPayment = (
  event: MouseEvent<HTMLElement>,
  prefill?: PaymentPrefill
) => void;

/** Who owes whom in each currency, and the payments that would settle it. */
export default function BalancesPage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const balances = useQuery(
    endpointQuery("listBalances", { params: { householdId } })
  );
  const parties = useParties();
  const open = balances.data?.items.filter(isOpen);

  // One dialog for the whole page: recording a suggestion refetches the list
  // and may remove the row it was opened from, which mustn't take the dialog
  // with it. Cancelling returns focus to the button that opened it; recording
  // sends it to the header's button, since a suggestion's may be about to go.
  const [payment, setPayment] = useState<{
    open: boolean;
    prefill?: PaymentPrefill;
  }>({ open: false });
  const opener = useRef<HTMLElement | null>(null);
  const recordButton = useRef<HTMLButtonElement>(null);
  const startPayment: StartPayment = (event, prefill) => {
    opener.current = event.currentTarget;
    setPayment({ open: true, prefill });
  };

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
        actions={
          enabled && parties.length > 1 ? (
            <Button onClick={(event) => startPayment(event)} ref={recordButton}>
              <PlusIcon aria-hidden data-icon="inline-start" />
              Record payment
            </Button>
          ) : null
        }
        description="Each currency is settled on its own: amounts are never converted or added together."
        title="Balances"
      />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      <QueryState
        query={balances}
        skeleton={<ListSkeleton label="Loading balances" rows={3} />}
      >
        {() =>
          open?.length ? (
            open.map((group) => (
              <CurrencyGroup group={group} key={group.currency} />
            ))
          ) : (
            <EmptyState
              description="Nobody owes anybody anything here."
              icon={CircleCheckIcon}
              title="All settled up"
            />
          )
        }
      </QueryState>
      {open?.length ? <Suggestions onRecord={startPayment} /> : null}
      <PaymentDialog
        finalFocus={() =>
          opener.current?.isConnected ? opener.current : recordButton.current
        }
        onOpenChange={(next) =>
          setPayment((current) => ({ ...current, open: next }))
        }
        onRecorded={() => {
          opener.current = null;
          setPayment((current) => ({ ...current, open: false }));
        }}
        open={payment.open}
        prefill={payment.prefill}
      />
    </>
  );
}

const isOpen = ({ balances }: CurrencyBalances) =>
  balances.some(({ amountCents }) => amountCents !== 0);

function CurrencyGroup({ group }: { group: CurrencyBalances }) {
  const { userId } = useHousehold();
  const isDeparted = useIsDeparted();
  const { currency, balances } = group;
  const headingId = `balances-${currency}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id={headingId}>
        {currency}{" "}
        <span className="text-muted-foreground font-normal">
          · {currencyName(currency)}
        </span>
      </h2>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {balances.map(({ user, amountCents }) => {
          const you = user.id === userId;
          const departed = isDeparted(user);
          return (
            <li
              className={cn(
                "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3",
                you && "bg-muted"
              )}
              key={user.id}
            >
              <UserLabel departed={departed} user={user} you={you} />
              <span
                className={cn(
                  "ml-auto text-sm tabular-nums",
                  you ? ownRowColor(amountCents) : otherRowColor(amountCents)
                )}
              >
                {describeBalance(amountCents, currency, { you })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const otherRowColor = (amountCents: number) => {
  if (amountCents < 0) {
    return "text-destructive";
  }
  return amountCents === 0 ? "text-muted-foreground" : undefined;
};

/** The highlighted row's background needs stronger colors to keep 4.5:1. */
const ownRowColor = (amountCents: number) =>
  cn(
    "font-medium",
    amountCents < 0 &&
      "dark:text-destructive text-[color-mix(in_oklch,var(--destructive),black_20%)]"
  );

function Suggestions({ onRecord }: { onRecord: StartPayment }) {
  const householdId = useHouseholdId();
  const suggestions = useQuery(
    endpointQuery("listSettlementSuggestions", { params: { householdId } })
  );
  return (
    <section
      aria-labelledby="suggestions-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium" id="suggestions-heading">
          Suggested payments
        </h2>
        <p className="text-muted-foreground text-sm">
          The fewest payments that would bring everyone to zero. Once the money
          has changed hands, record it here.
        </p>
      </div>
      <QueryState
        query={suggestions}
        skeleton={<ListSkeleton label="Loading suggested payments" rows={2} />}
      >
        {({ items }) =>
          items.map((group) => (
            <CurrencySuggestions
              group={group}
              key={group.currency}
              onRecord={onRecord}
            />
          ))
        }
      </QueryState>
    </section>
  );
}

function CurrencySuggestions({
  group: { currency, suggestions },
  onRecord,
}: {
  group: CurrencySettlementSuggestions;
  onRecord: StartPayment;
}) {
  const { userId } = useHousehold();
  const mine = ({ payer, payee }: SettlementSuggestion) =>
    payer.id === userId || payee.id === userId;
  const ordered = [...suggestions].sort(
    (a, b) => Number(mine(b)) - Number(mine(a))
  );
  return (
    <ul
      aria-label={`Suggested payments in ${currency}`}
      className="flex flex-col divide-y rounded-xl border"
    >
      {ordered.map((suggestion) => (
        <SuggestionRow
          currency={currency}
          key={`${suggestion.payer.id}-${suggestion.payee.id}`}
          onRecord={onRecord}
          suggestion={suggestion}
        />
      ))}
    </ul>
  );
}

function SuggestionRow({
  currency,
  onRecord,
  suggestion,
}: {
  currency: string;
  onRecord: StartPayment;
  suggestion: SettlementSuggestion;
}) {
  const { userId } = useHousehold();
  const isDeparted = useIsDeparted();
  const can = usePermissions();
  const enabled = useFeatureEnabled("expenses");
  const { payer, payee, amountCents } = suggestion;
  const transfer = describeTransfer(suggestion, userId);
  const amount = formatMoney({ amountCents, currency });
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {transfer}
          {isDeparted(payer) || isDeparted(payee) ? (
            <Badge variant="outline">Left the household</Badge>
          ) : null}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {amount}
        </span>
      </div>
      {enabled && can.recordPayment(suggestion) ? (
        <Button
          aria-label={`Record: ${transfer} ${amount}`}
          onClick={(event) =>
            onRecord(event, {
              payerId: payer.id,
              payeeId: payee.id,
              amountCents,
              currency,
            })
          }
          size="sm"
          variant="outline"
        >
          Record
        </Button>
      ) : null}
    </li>
  );
}
