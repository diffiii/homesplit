"use client";

import {
  type ExpenseCategory,
  UNCATEGORIZED,
  type UserSummary,
} from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CategoryIcon } from "@/components/category-icon";
import {
  useHousehold,
  useHouseholdId,
  useIsDeparted,
} from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserLabel } from "@/components/user-avatar";
import { endpointQuery } from "@/lib/api/queries";
import { formatIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import {
  type ExpenseFilters,
  expenseFiltersSearch,
  hasFilters,
} from "@/lib/expenses";

/** The value of the "no filter" choice in each select. */
const ALL = "all";

/** Applies filters by replacing the URL, so they survive a reload and can be shared. */
export function useSetExpenseFilters(): (filters: ExpenseFilters) => void {
  const router = useRouter();
  const pathname = usePathname();
  return (filters) => {
    const search = expenseFiltersSearch(filters);
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  };
}

interface ExpenseFiltersBarProps {
  filters: ExpenseFilters;
  /** People on the expenses loaded so far, so departed ones can be picked too. */
  seenUsers: readonly UserSummary[];
}

/** Category, person, and date range, combined with AND, plus a way to clear them all. */
export function ExpenseFiltersBar({
  filters,
  seenUsers,
}: ExpenseFiltersBarProps) {
  const setFilters = useSetExpenseFilters();
  const set = (patch: Partial<ExpenseFilters>) =>
    setFilters({ ...filters, ...patch });

  return (
    <search
      aria-label="Filter expenses"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <CategoryFilter
        onValueChange={(categoryId) => set({ categoryId })}
        value={filters.categoryId}
      />
      <PersonFilter
        onValueChange={(userId) => set({ userId })}
        seenUsers={seenUsers}
        value={filters.userId}
      />
      <DateRangeFilter
        from={filters.from}
        onRangeChange={(from, to) => set({ from, to })}
        to={filters.to}
      />
      {hasFilters(filters) ? (
        <Button onClick={() => setFilters({})} variant="ghost">
          <XIcon aria-hidden data-icon="inline-start" />
          Clear filters
        </Button>
      ) : null}
    </search>
  );
}

function CategoryFilter({
  value,
  onValueChange,
}: {
  onValueChange: (categoryId: string | undefined) => void;
  value: string | undefined;
}) {
  const householdId = useHouseholdId();
  const categories = useQuery(
    endpointQuery("listExpenseCategories", { params: { householdId } })
  );
  const items = categories.data?.items ?? [];
  const label = (id: string): string => {
    if (id === ALL) {
      return "All categories";
    }
    if (id === UNCATEGORIZED) {
      return "No category";
    }
    return items.find((category) => category.id === id)?.name ?? "Category";
  };
  const icon = (id: string): Pick<ExpenseCategory, "icon"> | null =>
    items.find((category) => category.id === id) ?? null;
  const ids = [ALL, UNCATEGORIZED, ...items.map(({ id }) => id)];

  return (
    <Select
      items={ids.map((id) => ({ value: id, label: label(id) }))}
      onValueChange={(next: string | null) =>
        onValueChange(next && next !== ALL ? next : undefined)
      }
      value={value ?? ALL}
    >
      <SelectTrigger aria-label="Category" className="w-full sm:w-48">
        <SelectValue>
          {(id: string) => <OptionLabel icon={icon(id)} label={label(id)} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ids.map((id) => (
          <SelectItem key={id} value={id}>
            <OptionLabel icon={icon(id)} label={label(id)} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OptionLabel({
  icon,
  label,
}: {
  icon: Pick<ExpenseCategory, "icon"> | null;
  label: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryIcon category={icon} className="size-6 text-sm" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Current members first, then people who left: those with a balance, and
 * those on expenses already loaded. The API knows no other list of them.
 */
function usePeople(seenUsers: readonly UserSummary[]): UserSummary[] {
  const householdId = useHouseholdId();
  const { members } = useHousehold();
  const isDeparted = useIsDeparted();
  const balances = useQuery(
    endpointQuery("listBalances", { params: { householdId } })
  );
  const current = members.map(({ user }) => ({
    id: user.id,
    name: user.name,
    imageUrl: user.image ?? null,
  }));
  const departed = new Map<string, UserSummary>();
  const others = [
    ...(balances.data?.items.flatMap(({ balances: rows }) =>
      rows.map(({ user }) => user)
    ) ?? []),
    ...seenUsers,
  ];
  for (const user of others) {
    if (isDeparted(user)) {
      departed.set(user.id, user);
    }
  }
  const byName = (a: UserSummary, b: UserSummary) =>
    a.name.localeCompare(b.name, "en");
  return [...current.sort(byName), ...[...departed.values()].sort(byName)];
}

function PersonFilter({
  value,
  onValueChange,
  seenUsers,
}: {
  onValueChange: (userId: string | undefined) => void;
  seenUsers: readonly UserSummary[];
  value: string | undefined;
}) {
  const people = usePeople(seenUsers);
  const isDeparted = useIsDeparted();
  const person = (id: string) => people.find((user) => user.id === id);
  const label = (id: string) =>
    id === ALL ? "Everyone" : (person(id)?.name ?? "Someone who left");

  return (
    <Select
      items={[ALL, ...people.map(({ id }) => id)].map((id) => ({
        value: id,
        label: label(id),
      }))}
      onValueChange={(next: string | null) =>
        onValueChange(next && next !== ALL ? next : undefined)
      }
      value={value ?? ALL}
    >
      <SelectTrigger aria-label="Person" className="w-full sm:w-56">
        <SelectValue>
          {(id: string) => {
            const user = person(id);
            return user ? (
              <UserLabel departed={isDeparted(user)} size="sm" user={user} />
            ) : (
              label(id)
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Everyone</SelectItem>
        {people.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <UserLabel departed={isDeparted(user)} size="sm" user={user} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function rangeLabel(from: string | undefined, to: string | undefined) {
  if (from && to) {
    return from === to
      ? formatIsoDate(from)
      : `${formatIsoDate(from)} – ${formatIsoDate(to)}`;
  }
  if (from) {
    return `From ${formatIsoDate(from)}`;
  }
  if (to) {
    return `Until ${formatIsoDate(to)}`;
  }
  return "Any date";
}

const dayFormat = new Intl.DateTimeFormat("en", { dateStyle: "full" });

/** `Saturday, March 1, 2026`: the visible day number, not `1st`, is part of the name. */
function dayButtonLabel(
  date: Date,
  { today, selected }: { selected?: boolean; today?: boolean } = {}
): string {
  return [today && "Today", dayFormat.format(date), selected && "selected"]
    .filter(Boolean)
    .join(", ");
}

function DateRangeFilter({
  from,
  to,
  onRangeChange,
}: {
  from: string | undefined;
  onRangeChange: (from: string | undefined, to: string | undefined) => void;
  to: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  // The range being picked, ahead of the URL, so a quick second click
  // extends it rather than starting over.
  const [draft, setDraft] = useState<DateRange | undefined>();
  const label = rangeLabel(from, to);
  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        setDraft({
          from: from ? parseIsoDate(from) : undefined,
          to: to ? parseIsoDate(to) : undefined,
        });
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button
            aria-label={`Dates: ${label}`}
            className="w-full justify-start sm:w-auto"
            variant="outline"
          />
        }
      >
        <CalendarIcon aria-hidden data-icon="inline-start" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Dates" className="w-auto">
        <Calendar
          defaultMonth={from ? parseIsoDate(from) : undefined}
          labels={{ labelDayButton: dayButtonLabel }}
          mode="range"
          onSelect={(range) => {
            setDraft(range);
            onRangeChange(
              range?.from && toIsoDate(range.from),
              range?.to && toIsoDate(range.to)
            );
            // The first click picks one day; the second, a different one, ends the range.
            if (range?.from && range.to && +range.from !== +range.to) {
              setOpen(false);
            }
          }}
          selected={draft}
        />
        {from || to ? (
          <Button
            onClick={() => {
              onRangeChange(undefined, undefined);
              setOpen(false);
            }}
            variant="ghost"
          >
            <XIcon aria-hidden data-icon="inline-start" />
            Any date
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
