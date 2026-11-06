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
import { PaymentDialog, useParties } from "./payment-dialog";
import { WriteOffMenu } from "./write-off-menu";

/** Who owes whom in each currency, and the payments that would settle it. */
export default function BalancesPage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const balances = useQuery(
    endpointQuery("listBalances", { params: { householdId } })
  );
  const parties = useParties();
  const open = balances.data?.items.filter(isOpen);

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
            <PaymentDialog
              trigger={
                <Button>
                  <PlusIcon aria-hidden data-icon="inline-start" />
                  Record payment
                </Button>
              }
            />
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
      {open?.length ? <Suggestions /> : null}
    </>
  );
}

const isOpen = ({ balances }: CurrencyBalances) =>
  balances.some(({ amountCents }) => amountCents !== 0);

function CurrencyGroup({ group }: { group: CurrencyBalances }) {
  const { userId } = useHousehold();
  const isDeparted = useIsDeparted();
  const can = usePermissions();
  const enabled = useFeatureEnabled("expenses");
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
        {balances.map((balance) => {
          const { user, amountCents } = balance;
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
              <span className="ml-auto flex items-center gap-3">
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    you && "font-medium",
                    amountCents < 0 && "text-destructive",
                    amountCents === 0 && "text-muted-foreground"
                  )}
                >
                  {describeBalance(amountCents, currency, { you })}
                </span>
                {enabled && can.writeOff && departed && amountCents !== 0 ? (
                  <WriteOffMenu
                    balances={balances}
                    currency={currency}
                    subject={balance}
                  />
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Suggestions() {
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
            <CurrencySuggestions group={group} key={group.currency} />
          ))
        }
      </QueryState>
    </section>
  );
}

function CurrencySuggestions({
  group: { currency, suggestions },
}: {
  group: CurrencySettlementSuggestions;
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
          suggestion={suggestion}
        />
      ))}
    </ul>
  );
}

function SuggestionRow({
  currency,
  suggestion,
}: {
  currency: string;
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
        <PaymentDialog
          prefill={{
            payerId: payer.id,
            payeeId: payee.id,
            amountCents,
            currency,
          }}
          trigger={
            <Button
              aria-label={`Record: ${transfer} ${amount}`}
              size="sm"
              variant="outline"
            >
              Record
            </Button>
          }
        />
      ) : null}
    </li>
  );
}
