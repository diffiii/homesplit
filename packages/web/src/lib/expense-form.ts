import {
  type AllocatedSplit,
  allocate,
  CreateExpenseRequest,
  MAX_AMOUNT_CENTS,
} from "@homesplit/contracts";
import { issuesOf } from "@/lib/api/api-error";
import { errorMessage } from "@/lib/api/error-message";
import type { ServerErrors } from "@/lib/form";
import { amountError, parseAmount } from "@/lib/money";

/** What the simple expense form holds: the user pays it all, and it's split equally. */
export interface SimpleExpenseValues {
  /** As typed; converted with `parseAmount` on submit. */
  amount: string;
  categoryId: string | null;
  currency: string;
  expenseDate: string;
  name: string;
  /** User IDs of the people splitting it, in the order shown. */
  participantIds: string[];
}

export type SimpleExpenseField = keyof SimpleExpenseValues;

/**
 * The request for `values`, paid in full by `payerId` and split equally.
 * `null` while the amount doesn't parse, since there's no total to send.
 */
export function toCreateExpenseRequest(
  values: SimpleExpenseValues,
  payerId: string
): CreateExpenseRequest | null {
  const amount = parseAmount(values.amount, values.currency);
  if (!amount.ok) {
    return null;
  }
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    expenseDate: values.expenseDate,
    total: { amountCents: amount.cents, currency: values.currency },
    payers: [{ userId: payerId, amountCents: amount.cents }],
    allocation: {
      method: "equal",
      participants: values.participantIds.map((userId) => ({ userId })),
    },
  };
}

/**
 * Each participant's share of what's typed so far, from the shared allocation
 * engine, or `null` while there's no valid amount or nobody to split it.
 */
export function previewShares(
  values: Pick<SimpleExpenseValues, "amount" | "currency" | "participantIds">
): AllocatedSplit[] | null {
  const amount = parseAmount(values.amount, values.currency);
  if (
    !amount.ok ||
    amount.cents <= 0 ||
    amount.cents > MAX_AMOUNT_CENTS ||
    values.participantIds.length === 0
  ) {
    return null;
  }
  return allocate(amount.cents, {
    method: "equal",
    participants: values.participantIds.map((userId) => ({ userId })),
  });
}

/** The form field an issue at `path` of `CreateExpenseRequest` belongs to, if any. */
export function fieldForPath(
  path: readonly PropertyKey[]
): SimpleExpenseField | undefined {
  const [first, second] = path;
  switch (first) {
    case "name":
    case "expenseDate":
    case "categoryId":
      return first;
    case "total":
      return second === "currency" ? "currency" : "amount";
    // The user pays the whole total, so the payer's amount is the amount.
    case "payers":
      return path[2] === "amountCents" ? "amount" : undefined;
    case "allocation":
      return "participantIds";
    default:
      return;
  }
}

/** What to tell the user about a field `CreateExpenseRequest` rejected. */
const CLIENT_MESSAGES: Record<SimpleExpenseField, (cents: number) => string> = {
  name: () => "Enter a name.",
  amount: (cents) =>
    cents > MAX_AMOUNT_CENTS
      ? "That amount is too large."
      : "Enter an amount above zero.",
  currency: () => "Pick a currency.",
  expenseDate: () => "Pick a date.",
  categoryId: () => "Pick another category.",
  participantIds: () => "Pick at least one person to split it with.",
};

/**
 * Validate `values` with `CreateExpenseRequest`, as the server will, in the
 * shape a TanStack Form validator returns: a message per field, and one for
 * the form if an issue fits no field. `undefined` when the request is valid.
 */
export function validateSimpleExpense(
  values: SimpleExpenseValues,
  payerId: string
): ServerErrors | undefined {
  const fields: Partial<Record<SimpleExpenseField, string>> = {};
  const amount = amountError(values.amount, values.currency);
  if (amount) {
    fields.amount = amount;
  }
  // Without an amount, a placeholder total still checks the other fields.
  const request = toCreateExpenseRequest(
    amount ? { ...values, amount: "1" } : values,
    payerId
  );
  const issues = CreateExpenseRequest.safeParse(request).error?.issues ?? [];
  const cents = request?.total.amountCents ?? 0;
  let form: string | undefined;
  for (const issue of issues) {
    const field = fieldForPath(issue.path);
    if (field) {
      fields[field] ??= CLIENT_MESSAGES[field](cents);
    } else {
      form = "Some of the details aren't valid. Check them and try again.";
    }
  }
  if (!form && Object.keys(fields).length === 0) {
    return;
  }
  return { fields, form };
}

const nameList = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * Where the server's answer to a create goes. A participant who left the
 * household meanwhile is named on the participant list, and a deleted
 * category on the category; anything else goes to the form.
 */
export function createExpenseServerErrors(
  error: unknown,
  participantIds: readonly string[],
  nameOf: (userId: string) => string
): ServerErrors {
  const fields: Partial<Record<SimpleExpenseField, string>> = {};
  const departed: string[] = [];
  const unplaced: string[] = [];
  for (const { path, message } of issuesOf(error)) {
    const field = fieldForPath(path);
    const [, , index, key] = path;
    if (
      field === "participantIds" &&
      typeof index === "number" &&
      key === "userId" &&
      participantIds[index]
    ) {
      departed.push(nameOf(participantIds[index]));
    } else if (field === "categoryId") {
      fields.categoryId ??= "This category was deleted. Pick another one.";
    } else if (field) {
      fields[field] ??= message;
    } else {
      unplaced.push(message);
    }
  }
  if (departed.length > 0) {
    fields.participantIds = `${nameList.format(departed)} left the household. Uncheck ${departed.length === 1 ? "them" : "everyone who left"} to save.`;
  }
  if (unplaced.length > 0) {
    return { fields, form: unplaced.join(" ") };
  }
  if (Object.keys(fields).length > 0) {
    return { fields };
  }
  return { fields, form: errorMessage(error) };
}
