import {
  type Expense,
  type ExpenseAllocationInput,
  Id,
  IsoDate,
  type ListExpensesQuery,
  type SplitMethod,
  UNCATEGORIZED,
} from "@homesplit/contracts";
import { formatIsoDate, todayIsoDate, toIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/** The list filters `GET /expenses` takes, as the page keeps them in its URL. */
export type ExpenseFilters = Pick<
  ListExpensesQuery,
  "categoryId" | "userId" | "from" | "to"
>;

/** URL parameter for each filter. */
const FILTER_PARAMS = {
  categoryId: "category",
  userId: "person",
  from: "from",
  to: "to",
} as const satisfies Record<keyof ExpenseFilters, string>;

/**
 * The filters in the page's URL. A value the API would reject is dropped, as
 * are both dates when `from` is after `to`, so a hand-edited link still shows
 * the list.
 */
export function parseExpenseFilters(search: URLSearchParams): ExpenseFilters {
  const read = (key: keyof ExpenseFilters) =>
    search.get(FILTER_PARAMS[key]) ?? undefined;
  const category = read("categoryId");
  const filters: ExpenseFilters = {
    categoryId:
      category === UNCATEGORIZED ? category : Id.safeParse(category).data,
    userId: Id.safeParse(read("userId")).data,
    from: IsoDate.safeParse(read("from")).data,
    to: IsoDate.safeParse(read("to")).data,
  };
  if (filters.from && filters.to && filters.from > filters.to) {
    filters.from = undefined;
    filters.to = undefined;
  }
  return withoutEmpty(filters);
}

/** The page's query string for `filters`, without a leading `?`. */
export function expenseFiltersSearch(filters: ExpenseFilters): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(FILTER_PARAMS) as (keyof ExpenseFilters)[]) {
    const value = filters[key];
    if (value) {
      search.set(FILTER_PARAMS[key], value);
    }
  }
  return search.toString();
}

/** `filters` without the keys that are unset, so equal filters make equal query keys. */
export function withoutEmpty(filters: ExpenseFilters): ExpenseFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value)
  ) as ExpenseFilters;
}

export function hasFilters(filters: ExpenseFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export interface ExpenseDateGroup {
  date: string;
  expenses: Expense[];
}

/** Consecutive expenses on the same date, in the list's order. */
export function groupByDate(expenses: readonly Expense[]): ExpenseDateGroup[] {
  const groups: ExpenseDateGroup[] = [];
  for (const expense of expenses) {
    const last = groups.at(-1);
    if (last?.date === expense.expenseDate) {
      last.expenses.push(expense);
    } else {
      groups.push({ date: expense.expenseDate, expenses: [expense] });
    }
  }
  return groups;
}

/** `Today`, `Yesterday`, or the date, such as `Mar 1, 2026`. */
export function formatGroupDate(date: string, now = new Date()): string {
  if (date === todayIsoDate(now)) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date === toIsoDate(yesterday)) {
    return "Yesterday";
  }
  return formatIsoDate(date);
}

/** `Alice`, `Alice and Bartek`, or `Alice and 2 others`, by first name. */
export function formatPayers(expense: Pick<Expense, "payers">): string {
  const names = expense.payers.map(({ user }) => user.name);
  const [first, second] = names;
  if (names.length === 1) {
    return first;
  }
  if (names.length === 2) {
    return `${first} and ${second}`;
  }
  return `${first} and ${names.length - 1} others`;
}

export type UserNet =
  | { kind: "not-involved" }
  | { kind: "settled" }
  | { kind: "lent" | "owes"; text: string };

/**
 * What the expense means for `userId`: what they paid minus their split.
 * Positive means the others owe them, in the expense's currency.
 */
export function userNet(expense: Expense, userId: string): UserNet {
  const paid = expense.payers.find(({ user }) => user.id === userId);
  const split = expense.splits.find(({ user }) => user.id === userId);
  if (!(paid || split)) {
    return { kind: "not-involved" };
  }
  const net = (paid?.amountCents ?? 0) - (split?.amountCents ?? 0);
  if (net === 0) {
    return { kind: "settled" };
  }
  const amount = formatMoney({
    amountCents: Math.abs(net),
    currency: expense.total.currency,
  });
  return net > 0
    ? { kind: "lent", text: `You lent ${amount}` }
    : { kind: "owes", text: `You owe ${amount}` };
}

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: "Split equally",
  percentage: "By percentage",
  shares: "By shares",
  exact: "Exact amounts",
  adjustment: "Equally, with adjustments",
};

const percentFormat = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 2,
});

/**
 * What one participant put into the allocation: `50%`, `2 shares`, an
 * amount, or a signed adjustment. `null` for an equal split, which has none.
 */
export function allocationInput(
  allocation: ExpenseAllocationInput,
  userId: string,
  currency: string
): string | null {
  switch (allocation.method) {
    case "percentage": {
      const entry = allocation.participants.find((p) => p.userId === userId);
      return entry ? percentFormat.format(entry.basisPoints / 10_000) : null;
    }
    case "shares": {
      const entry = allocation.participants.find((p) => p.userId === userId);
      if (!entry) {
        return null;
      }
      return entry.shares === 1 ? "1 share" : `${entry.shares} shares`;
    }
    case "exact": {
      const entry = allocation.participants.find((p) => p.userId === userId);
      return entry
        ? formatMoney({ amountCents: entry.amountCents, currency })
        : null;
    }
    case "adjustment": {
      const entry = allocation.participants.find((p) => p.userId === userId);
      if (!entry) {
        return null;
      }
      return entry.adjustmentCents === 0
        ? "No adjustment"
        : formatMoney(
            { amountCents: entry.adjustmentCents, currency },
            { signDisplay: "exceptZero" }
          );
    }
    default:
      return null;
  }
}
