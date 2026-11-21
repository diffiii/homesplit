"use client";

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronRightIcon, LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import {
  useHousehold,
  useHouseholdId,
  usePermissions,
  useWaitingPayments,
} from "@/components/shell/household-context";
import { balancesPath, householdPath } from "@/components/shell/household-nav";
import { buttonVariants } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { endpointQuery } from "@/lib/api/queries";
import { choreFiltersSearch, isOverdue } from "@/lib/chores";
import { formatDueTime, formatIsoDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { describeBalance, describePayment } from "@/lib/settlements";
import { ExpenseRow } from "./expenses/expense-list";

const CHORE_ROWS = 5;
const EXPENSE_ROWS = 3;

/** What needs the user in this household, one card per enabled module. */
export default function HouseholdOverviewPage() {
  const { features, household } = useHousehold();
  const can = usePermissions();

  if (!(features.expenses || features.chores || features.shopping)) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState
          action={
            can.updateFeatures ? (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={householdPath(household.id, "settings")}
              >
                Open settings
              </Link>
            ) : null
          }
          description={
            can.updateFeatures
              ? "Turn on expenses, chores, or shopping to see them here."
              : "Ask an admin to turn on expenses, chores, or shopping."
          }
          icon={LayoutDashboardIcon}
          title="No modules are turned on"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        description={
          <span className="max-md:hidden">What needs you right now.</span>
        }
        title="Overview"
      />
      <div className="flex flex-wrap gap-4">
        {features.expenses ? <MoneyCard /> : null}
        {features.shopping ? <ShoppingCard /> : null}
        {features.chores ? <ChoresCard /> : null}
        {features.expenses ? <ExpensesCard /> : null}
      </div>
    </>
  );
}

interface CardProps<T> {
  children: (data: T) => ReactNode;
  className?: string;
  /** Rows above the query's content that don't wait for it. */
  lead?: ReactNode;
  query: UseQueryResult<T>;
  title: string;
  wide?: boolean;
}

/** A titled box that loads and fails on its own. */
function Card<T>({
  title,
  wide,
  lead,
  query,
  className,
  children,
}: CardProps<T>) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col divide-y overflow-hidden rounded-xl border",
        wide ? "flex-[3_1_20rem]" : "flex-[2_1_14rem]",
        className
      )}
    >
      <h2 className="px-4 py-3 text-base font-medium" id={headingId}>
        {title}
      </h2>
      {lead}
      <QueryState
        query={query}
        skeleton={
          <div className="px-4">
            <ListSkeleton label={`Loading ${title.toLowerCase()}`} rows={2} />
          </div>
        }
      >
        {children}
      </QueryState>
    </section>
  );
}

function CardLink({ href, children }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="hover:bg-muted/50 focus-visible:ring-ring/50 mt-auto flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-inset"
      href={href}
    >
      {children}
      <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
    </Link>
  );
}

function MoneyCard() {
  const { household, userId } = useHousehold();
  const waiting = useWaitingPayments();
  const balances = useQuery(
    endpointQuery("listBalances", { params: { householdId: household.id } })
  );
  const href = balancesPath(household.id);
  return (
    <Card
      lead={
        waiting.length > 0 ? (
          <Link
            className="bg-muted hover:bg-muted/70 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-inset"
            href={href}
          >
            <span className="min-w-0 flex-1">
              {waiting.length === 1
                ? `${describePayment(waiting[0], userId)} ${formatMoney(waiting[0].amount)}`
                : `${waiting.length} payments waiting for you`}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              Review
              <ChevronRightIcon aria-hidden className="size-4" />
            </span>
          </Link>
        ) : null
      }
      query={balances}
      title="Money"
      wide
    >
      {({ items }) => {
        const mine = items.flatMap(({ currency, balances: rows }) => {
          const own = rows.find(({ user }) => user.id === userId);
          return own && own.amountCents !== 0
            ? [{ currency, amountCents: own.amountCents }]
            : [];
        });
        return (
          <>
            {mine.length === 0 ? (
              <p className="px-4 py-3 text-sm font-medium">You're settled up</p>
            ) : (
              <ul className="divide-y">
                {mine.map(({ currency, amountCents }) => (
                  <li
                    className={cn(
                      "px-4 py-3 text-sm font-medium",
                      amountCents < 0 ? "text-destructive" : "text-positive"
                    )}
                    key={currency}
                  >
                    {describeBalance(amountCents, currency, { you: true })}
                  </li>
                ))}
              </ul>
            )}
            <CardLink href={href}>
              {mine.length === 0 ? "Open balances" : "Settle up"}
            </CardLink>
          </>
        );
      }}
    </Card>
  );
}

function ShoppingCard() {
  const householdId = useHouseholdId();
  const items = useQuery(
    endpointQuery("listShoppingItems", {
      params: { householdId },
      query: { pageSize: 1 },
    })
  );
  return (
    <Card query={items} title="Shopping">
      {({ totalItems }) => (
        <>
          <p className="flex items-baseline gap-2 px-4 py-3 text-sm">
            {totalItems === 0 ? (
              <span className="font-medium">Nothing to buy</span>
            ) : (
              <>
                <span className="text-3xl font-semibold tabular-nums">
                  {totalItems}
                </span>
                <span className="text-muted-foreground">
                  {totalItems === 1 ? "item" : "items"} to buy
                </span>
              </>
            )}
          </p>
          <CardLink href={householdPath(householdId, "shopping")}>
            Open the list
          </CardLink>
        </>
      )}
    </Card>
  );
}

function ChoresCard() {
  const { household, userId } = useHousehold();
  const now = useNow();
  const chores = useQuery(
    endpointQuery("listChores", {
      params: { householdId: household.id },
      query: { assignedToId: userId, pageSize: CHORE_ROWS },
    })
  );
  return (
    <Card query={chores} title="Your chores" wide>
      {({ items, totalItems }) => (
        <>
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm font-medium">
              You have no open chores
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((chore) => {
                const overdue = isOverdue(chore, now);
                return (
                  <li
                    className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-3 text-sm"
                    key={chore.id}
                  >
                    <span className="font-medium break-words">
                      {chore.name}
                    </span>
                    {chore.dueAt ? (
                      <time
                        className={
                          overdue
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        }
                        dateTime={chore.dueAt}
                        title={formatIsoDateTime(chore.dueAt)}
                      >
                        {overdue ? (
                          <span className="sr-only">Overdue: </span>
                        ) : null}
                        {formatDueTime(chore.dueAt, now)}
                      </time>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <CardLink
            href={`${householdPath(household.id, "chores")}?${choreFiltersSearch({ mine: true, completed: false })}`}
          >
            All your chores ({totalItems})
          </CardLink>
        </>
      )}
    </Card>
  );
}

function ExpensesCard() {
  const householdId = useHouseholdId();
  const expenses = useQuery(
    endpointQuery("listExpenses", {
      params: { householdId },
      query: { pageSize: EXPENSE_ROWS },
    })
  );
  return (
    <Card className="max-md:hidden" query={expenses} title="Recent expenses">
      {({ items }) => (
        <>
          {items.length === 0 ? (
            <p className="text-muted-foreground px-4 py-3 text-sm">
              No expenses yet
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((expense) => (
                <ExpenseRow expense={expense} key={expense.id} />
              ))}
            </ul>
          )}
          <CardLink href={householdPath(householdId, "expenses")}>
            All expenses
          </CardLink>
        </>
      )}
    </Card>
  );
}
