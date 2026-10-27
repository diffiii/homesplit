import {
  type AllocatedSplit,
  AllocationError,
  allocate,
  CreateExpenseRequest,
  type ExpenseAllocationInput,
  FULL_PERCENTAGE_BASIS_POINTS,
  MAX_AMOUNT_CENTS,
  type SplitMethod,
} from "@homesplit/contracts";
import { issuesOf } from "@/lib/api/api-error";
import { errorMessage } from "@/lib/api/error-message";
import type { ServerErrors } from "@/lib/form";
import {
  amountError,
  decimalString,
  formatMoney,
  parseAmount,
  parseDecimal,
  toDecimalString,
} from "@/lib/money";

/** The methods with an input per person; `equal` has none. */
export type WeightedMethod = Exclude<SplitMethod, "equal">;

/** Each person's input for each method, as typed, by user ID. */
export interface SplitInputs {
  /** Missing or empty means no adjustment. */
  adjustment: Record<string, string>;
  /** `null` until one is edited; until then everyone owes an even share of the amount. */
  exact: Record<string, string> | null;
  /** `null` until one is edited; until then everyone gets an even share of 100%. */
  percentage: Record<string, string> | null;
  /** Missing means 1. */
  shares: Record<string, string>;
}

/**
 * What the expense form holds. In simple mode the user pays it all and it's
 * split equally; the advanced section adds payers and the other methods.
 */
export interface ExpenseFormValues {
  /** Whether the advanced section is open. */
  advanced: boolean;
  /** As typed; converted with `parseAmount` on submit. */
  amount: string;
  categoryId: string | null;
  currency: string;
  expenseDate: string;
  /** Always `equal` in simple mode. */
  method: SplitMethod;
  name: string;
  /** User IDs of the people splitting it, in the order shown. */
  participantIds: string[];
  /**
   * What each payer paid, as typed, by user ID. `null` until one is edited;
   * until then the payers share the amount evenly. Advanced only.
   */
  payerAmounts: Record<string, string> | null;
  /** User IDs of the people who paid, in the order shown. Advanced only. */
  payerIds: string[];
  splits: SplitInputs;
}

/** The form's start: the user pays, split equally between `participantIds`. */
export function initialExpenseValues(
  fields: Pick<
    ExpenseFormValues,
    "currency" | "expenseDate" | "participantIds"
  > & { userId: string }
): ExpenseFormValues {
  return {
    name: "",
    amount: "",
    currency: fields.currency,
    expenseDate: fields.expenseDate,
    categoryId: null,
    participantIds: fields.participantIds,
    advanced: false,
    payerIds: [fields.userId],
    payerAmounts: null,
    method: "equal",
    splits: { percentage: null, shares: {}, exact: null, adjustment: {} },
  };
}

/** The form field of a payer's amount. */
export const payerAmountField = (userId: string) =>
  `payerAmounts.${userId}` as const;

/** The form field of a participant's input for `method`. */
export const splitField = (method: WeightedMethod, userId: string) =>
  `splits.${method}.${userId}` as const;

/** The key each method's participants carry their input in. */
const SPLIT_KEYS = {
  percentage: "basisPoints",
  shares: "shares",
  exact: "amountCents",
  adjustment: "adjustmentCents",
} as const satisfies Record<WeightedMethod, string>;

const PERCENT_EXPONENT = 2;
const WHOLE_NUMBER = /^\d+$/;
const TRAILING_ZEROS = /\.0+$|(\.\d*?)0+$/;

/** `33.3` for 3330 basis points: a percentage without trailing zeros. */
export function formatPercentage(basisPoints: number): string {
  return decimalString(basisPoints, PERCENT_EXPONENT).replace(
    TRAILING_ZEROS,
    "$1"
  );
}

/** The amount in minor units if it's a total the API accepts, else `null`. */
function totalCents({
  amount,
  currency,
}: Pick<ExpenseFormValues, "amount" | "currency">): number | null {
  const parsed = parseAmount(amount, currency);
  return parsed.ok && parsed.cents > 0 && parsed.cents <= MAX_AMOUNT_CENTS
    ? parsed.cents
    : null;
}

/** `total` split evenly between `userIds` by the shared engine. */
function evenSplit(
  total: number,
  userIds: readonly string[]
): Map<string, number> {
  if (userIds.length === 0) {
    return new Map();
  }
  return new Map(
    allocate(total, {
      method: "equal",
      participants: userIds.map((userId) => ({ userId })),
    }).map((split) => [split.userId, split.amountCents])
  );
}

/** An even split of the amount as each person's input, or blanks without an amount. */
function evenAmountInputs(
  values: ExpenseFormValues,
  userIds: readonly string[]
): Record<string, string> {
  const total = totalCents(values);
  const amounts = total === null ? new Map() : evenSplit(total, userIds);
  return Object.fromEntries(
    userIds.map((id) => {
      const cents = amounts.get(id);
      return [
        id,
        cents === undefined ? "" : toDecimalString(cents, values.currency),
      ];
    })
  );
}

/** What each payer's amount shows: as typed, or an even share of the amount. */
export function payerAmountInputs(
  values: ExpenseFormValues
): Record<string, string> {
  if (!values.payerAmounts) {
    return evenAmountInputs(values, values.payerIds);
  }
  const typed = values.payerAmounts;
  return Object.fromEntries(values.payerIds.map((id) => [id, typed[id] ?? ""]));
}

/**
 * What each participant's input for `method` shows: as typed, or until a
 * percentage or exact amount is edited, an even split.
 */
export function splitInputs(
  values: ExpenseFormValues,
  method: WeightedMethod
): Record<string, string> {
  const ids = values.participantIds;
  const typed = values.splits[method];
  if (typed) {
    const fallback = method === "shares" ? "1" : "";
    return Object.fromEntries(ids.map((id) => [id, typed[id] ?? fallback]));
  }
  if (method === "exact") {
    return evenAmountInputs(values, ids);
  }
  const basisPoints = evenSplit(FULL_PERCENTAGE_BASIS_POINTS, ids);
  return Object.fromEntries(
    ids.map((id) => [id, formatPercentage(basisPoints.get(id) ?? 0)])
  );
}

type ParsedInput = { ok: true; value: number } | { ok: false; message: string };

/** One participant's input for `method`, as the number the allocation takes. */
function parseSplitInput(
  method: WeightedMethod,
  input: string,
  currency: string
): ParsedInput {
  switch (method) {
    case "percentage": {
      const parsed = parseDecimal(input, PERCENT_EXPONENT);
      if (parsed.ok) {
        return { ok: true, value: parsed.cents };
      }
      switch (parsed.reason) {
        case "empty":
          return { ok: false, message: "Enter a percentage." };
        case "too-precise":
          return { ok: false, message: "Use at most 2 decimals." };
        case "too-large":
          return { ok: false, message: "Enter at most 100%." };
        default:
          return { ok: false, message: "Enter a number, like 25." };
      }
    }
    case "shares": {
      const text = input.trim();
      if (!text) {
        return { ok: false, message: "Enter a number of shares." };
      }
      return WHOLE_NUMBER.test(text)
        ? { ok: true, value: Number(text) }
        : { ok: false, message: "Enter a whole number, like 2." };
    }
    case "exact": {
      const parsed = parseAmount(input, currency);
      return parsed.ok
        ? { ok: true, value: parsed.cents }
        : { ok: false, message: amountError(input, currency) ?? "" };
    }
    default: {
      if (!input.trim()) {
        return { ok: true, value: 0 };
      }
      const options = { allowNegative: true };
      const parsed = parseAmount(input, currency, options);
      return parsed.ok
        ? { ok: true, value: parsed.cents }
        : { ok: false, message: amountError(input, currency, options) ?? "" };
    }
  }
}

/** The allocation for `values`, with `NaN` for inputs that don't parse. */
function allocationOf(
  values: ExpenseFormValues,
  errors: Record<string, string>
): ExpenseAllocationInput {
  const { method, participantIds, currency } = values;
  if (method === "equal") {
    return {
      method,
      participants: participantIds.map((userId) => ({ userId })),
    };
  }
  const inputs = splitInputs(values, method);
  const weights = participantIds.map((userId) => {
    const parsed = parseSplitInput(method, inputs[userId] ?? "", currency);
    // An even split that has nothing to split yet isn't the person's mistake.
    if (!(parsed.ok || values.splits[method] === null)) {
      errors[splitField(method, userId)] = parsed.message;
    }
    return { userId, weight: parsed.ok ? parsed.value : Number.NaN };
  });
  switch (method) {
    case "percentage":
      return {
        method,
        participants: weights.map(({ userId, weight }) => ({
          userId,
          basisPoints: weight,
        })),
      };
    case "shares":
      return {
        method,
        participants: weights.map(({ userId, weight }) => ({
          userId,
          shares: weight,
        })),
      };
    case "exact":
      return {
        method,
        participants: weights.map(({ userId, weight }) => ({
          userId,
          amountCents: weight,
        })),
      };
    default:
      return {
        method,
        participants: weights.map(({ userId, weight }) => ({
          userId,
          adjustmentCents: weight,
        })),
      };
  }
}

interface DraftRequest {
  /** What every input that doesn't parse says, by field. */
  errors: Record<string, string>;
  /** The request, with `NaN` for what doesn't parse. */
  request: CreateExpenseRequest;
}

function draftRequest(values: ExpenseFormValues, userId: string): DraftRequest {
  const errors: Record<string, string> = {};
  const amount = parseAmount(values.amount, values.currency);
  const amountMessage = amountError(values.amount, values.currency);
  if (amountMessage) {
    errors.amount = amountMessage;
  }
  const total = amount.ok ? amount.cents : Number.NaN;
  let payers = [{ userId, amountCents: total }];
  if (values.advanced) {
    const inputs = payerAmountInputs(values);
    payers = values.payerIds.map((id) => {
      const input = inputs[id] ?? "";
      const parsed = parseAmount(input, values.currency);
      if (!parsed.ok && values.payerAmounts) {
        errors[payerAmountField(id)] =
          amountError(input, values.currency) ?? "";
      }
      return { userId: id, amountCents: parsed.ok ? parsed.cents : Number.NaN };
    });
  }
  return {
    errors,
    request: {
      name: values.name.trim(),
      categoryId: values.categoryId,
      expenseDate: values.expenseDate,
      total: { amountCents: total, currency: values.currency },
      payers,
      allocation: allocationOf(values, errors),
    },
  };
}

/**
 * The request for `values`. In simple mode `payerId` pays it all. `null`
 * while the amount or a person's input doesn't parse.
 */
export function toCreateExpenseRequest(
  values: ExpenseFormValues,
  payerId: string
): CreateExpenseRequest | null {
  const { request, errors } = draftRequest(values, payerId);
  return Object.keys(errors).length === 0 ? request : null;
}

/**
 * Each participant's share of what's typed so far, from the shared allocation
 * engine, or `null` until the inputs make a split.
 */
export function previewShares(
  values: ExpenseFormValues
): AllocatedSplit[] | null {
  const total = totalCents(values);
  if (total === null || values.participantIds.length === 0) {
    return null;
  }
  const errors: Record<string, string> = {};
  const allocation = allocationOf(values, errors);
  if (Object.keys(errors).length > 0) {
    return null;
  }
  try {
    return allocate(total, allocation);
  } catch (error) {
    if (error instanceof AllocationError) {
      return null;
    }
    throw error;
  }
}

/** Whether the simple form can show `values`: the user paid it all, split equally. */
export function fitsSimpleMode(
  values: ExpenseFormValues,
  userId: string
): boolean {
  if (values.method !== "equal" || values.payerIds.join() !== userId) {
    return false;
  }
  const paid = payerAmountInputs(values)[userId] ?? "";
  const cents = parseAmount(paid, values.currency);
  const amount = parseAmount(values.amount, values.currency);
  return (
    paid.trim() === values.amount.trim() ||
    (cents.ok && amount.ok && cents.cents === amount.cents)
  );
}

/** A line under a list saying whether it adds up yet. */
export interface RunningCheck {
  /** Whether it adds up, or nothing is wrong. */
  ok: boolean;
  text: string;
}

/** How far `assigned` is from `whole`, both in the units `format` shows. */
function remainderCheck(
  whole: number,
  assigned: number,
  format: (units: number) => string,
  wholeName: string
): RunningCheck {
  const left = whole - assigned;
  if (left === 0) {
    return { ok: true, text: `Adds up to ${wholeName}.` };
  }
  return left > 0
    ? { ok: false, text: `${format(left)} unassigned.` }
    : { ok: false, text: `${format(-left)} over ${wholeName}.` };
}

const sumOf = (numbers: readonly number[]) =>
  numbers.reduce((total, n) => total + n, 0);

/** What's left of the amount once the payers' amounts are taken, or `null` without an amount. */
export function payersCheck(values: ExpenseFormValues): RunningCheck | null {
  const total = totalCents(values);
  if (total === null) {
    return null;
  }
  const inputs = payerAmountInputs(values);
  const paid = values.payerIds.map((id) => {
    const parsed = parseAmount(inputs[id] ?? "", values.currency);
    return parsed.ok ? parsed.cents : 0;
  });
  return remainderCheck(
    total,
    sumOf(paid),
    (cents) => formatMoney({ amountCents: cents, currency: values.currency }),
    "the amount"
  );
}

const nameList = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * How the inputs for the chosen method add up: percentages left to 100%,
 * exact amounts left to the total, shares in all, or who an adjustment
 * leaves with a negative share. `null` for an equal split or while there's
 * nothing to check.
 */
export function splitCheck(
  values: ExpenseFormValues,
  nameOf: (userId: string) => string
): RunningCheck | null {
  const { method, participantIds: ids, currency } = values;
  if (method === "equal" || ids.length === 0) {
    return null;
  }
  const inputs = splitInputs(values, method);
  const numbers = ids.map((id) => {
    const parsed = parseSplitInput(method, inputs[id] ?? "", currency);
    return parsed.ok ? parsed.value : 0;
  });
  const money = (cents: number) =>
    formatMoney({ amountCents: cents, currency });
  if (method === "percentage") {
    return remainderCheck(
      FULL_PERCENTAGE_BASIS_POINTS,
      sumOf(numbers),
      (basisPoints) => `${formatPercentage(basisPoints)}%`,
      "100%"
    );
  }
  if (method === "shares") {
    const shares = sumOf(numbers);
    return {
      ok: true,
      text: `${shares} ${shares === 1 ? "share" : "shares"} in total.`,
    };
  }
  const total = totalCents(values);
  if (total === null) {
    return null;
  }
  if (method === "exact") {
    return remainderCheck(total, sumOf(numbers), money, "the amount");
  }
  // As `CreateExpenseRequest` checks it, before rounding:
  // (total − adjustments) / people + adjustment ≥ 0.
  const rest = total - sumOf(numbers);
  const negative = ids.filter((_, i) => rest + numbers[i] * ids.length < 0);
  if (negative.length > 0) {
    return {
      ok: false,
      text: `${nameList.format(negative.map(nameOf))} would get a negative share.`,
    };
  }
  return {
    ok: true,
    text: `${money(rest)} is split equally before adjustments.`,
  };
}

/**
 * The form field an issue at `path` of `CreateExpenseRequest` belongs to,
 * if any: a payer's or participant's row, or the list as a whole.
 */
export function fieldForPath(
  path: readonly PropertyKey[],
  values: Pick<
    ExpenseFormValues,
    "advanced" | "method" | "participantIds" | "payerIds"
  >
): string | undefined {
  const [first, second, third, fourth] = path;
  switch (first) {
    case "name":
    case "expenseDate":
    case "categoryId":
      return first;
    case "total":
      return second === "currency" ? "currency" : "amount";
    case "payers": {
      // In simple mode the user pays the whole total, so their amount is the amount.
      if (!values.advanced) {
        return third === "amountCents" ? "amount" : undefined;
      }
      const payer = typeof second === "number" && values.payerIds[second];
      return payer && third === "amountCents"
        ? payerAmountField(payer)
        : "payerIds";
    }
    case "allocation": {
      const { method } = values;
      const participant =
        typeof third === "number" && values.participantIds[third];
      return participant && method !== "equal" && fourth === SPLIT_KEYS[method]
        ? splitField(method, participant)
        : "participantIds";
    }
    default:
      return;
  }
}

/** What to tell the user about an input `CreateExpenseRequest` rejected. */
function clientMessage(
  { path, code }: { code: string; path: readonly PropertyKey[] },
  values: ExpenseFormValues,
  request: CreateExpenseRequest
): string {
  const [first, second, third, fourth] = path;
  const amountMessage = (cents: number) =>
    cents > MAX_AMOUNT_CENTS
      ? "That amount is too large."
      : "Enter an amount above zero.";
  switch (first) {
    case "name":
      return "Enter a name.";
    case "expenseDate":
      return "Pick a date.";
    case "categoryId":
      return "Pick another category.";
    case "total":
      return second === "currency"
        ? "Pick a currency."
        : amountMessage(request.total.amountCents);
    case "payers":
      if (typeof second === "number") {
        return amountMessage(request.payers[second]?.amountCents ?? 0);
      }
      return values.payerIds.length === 0
        ? "Pick at least one person who paid."
        : "What everyone paid must add up to the amount.";
    default:
      break;
  }
  if (typeof third !== "number") {
    switch (values.participantIds.length === 0 ? "none" : values.method) {
      case "percentage":
        return "Percentages must add up to 100%.";
      case "exact":
        return "Amounts must add up to the amount.";
      default:
        return "Pick at least one person to split it with.";
    }
  }
  switch (fourth) {
    case "basisPoints":
      return "Enter a percentage above 0, up to 100.";
    case "shares":
      return "Enter a whole number from 1 to 1,000,000.";
    case "amountCents":
      return "That amount is too large.";
    default:
      // The negative-share check is the one custom issue on an adjustment.
      return code === "custom"
        ? "This would leave them a negative share."
        : "That adjustment is too large.";
  }
}

const hasNaN = (value: unknown): boolean =>
  typeof value === "number"
    ? Number.isNaN(value)
    : typeof value === "object" &&
      value !== null &&
      Object.values(value).some(hasNaN);

/**
 * Whether an issue waits on inputs that don't parse yet: it's about one of
 * them, which has a message of its own, or a sum or share that needs them.
 */
function awaitsInputs(
  { code, path }: { code: string; path: readonly PropertyKey[] },
  request: CreateExpenseRequest
): boolean {
  const at = path.reduce<unknown>(
    (value, key) =>
      typeof value === "object" && value !== null
        ? (value as Record<PropertyKey, unknown>)[key]
        : undefined,
    request
  );
  if (code === "custom") {
    return hasNaN(at) || Number.isNaN(request.total.amountCents);
  }
  return typeof at === "number" && Number.isNaN(at);
}

/**
 * Validate `values` with `CreateExpenseRequest`, as the server will, in the
 * shape a TanStack Form validator returns: a message per field, and one for
 * the form if an issue fits no field. `undefined` when the request is valid.
 */
export function validateExpense(
  values: ExpenseFormValues,
  payerId: string
): ServerErrors | undefined {
  const { request, errors } = draftRequest(values, payerId);
  const fields: Record<string, string> = { ...errors };
  const check = (body: CreateExpenseRequest) =>
    CreateExpenseRequest.safeParse(body).error?.issues ?? [];
  const issues = [
    ...check(request),
    // A row that doesn't parse stops every sum and share being checked, so
    // check each list again with the other one made valid.
    ...(hasNaN(request.payers)
      ? check({
          ...request,
          payers: [{ userId: payerId, amountCents: request.total.amountCents }],
        }).filter(({ path }) => path[0] === "allocation")
      : []),
    ...(hasNaN(request.allocation)
      ? check({
          ...request,
          allocation: {
            method: "equal",
            participants: request.allocation.participants.map(({ userId }) => ({
              userId,
            })),
          },
        }).filter(({ path }) => path[0] === "payers")
      : []),
  ];
  let form: string | undefined;
  for (const issue of issues) {
    const field = fieldForPath(issue.path, values);
    if (!field) {
      form = "Some of the details aren't valid. Check them and try again.";
    } else if (!awaitsInputs(issue, request)) {
      fields[field] ??= clientMessage(issue, values, request);
    }
  }
  if (!form && Object.keys(fields).length === 0) {
    return;
  }
  return { fields, form };
}

/**
 * Where the server's answer to a create goes. A payer or participant who
 * left the household meanwhile is named on their list, and a deleted
 * category on the category; anything else goes to its row or the form.
 */
export function createExpenseServerErrors(
  error: unknown,
  values: Pick<
    ExpenseFormValues,
    "advanced" | "method" | "participantIds" | "payerIds"
  >,
  nameOf: (userId: string) => string
): ServerErrors {
  const fields: Record<string, string> = {};
  const departed = { payerIds: [] as string[], participantIds: [] as string[] };
  const unplaced: string[] = [];
  for (const { path, message } of issuesOf(error)) {
    const field = fieldForPath(path, values);
    const index = path.at(-2);
    const list = field === "payerIds" ? values.payerIds : values.participantIds;
    if (
      (field === "payerIds" || field === "participantIds") &&
      typeof index === "number" &&
      path.at(-1) === "userId" &&
      list[index]
    ) {
      departed[field].push(nameOf(list[index]));
    } else if (field === "categoryId") {
      fields.categoryId ??= "This category was deleted. Pick another one.";
    } else if (field) {
      fields[field] ??= message;
    } else {
      unplaced.push(message);
    }
  }
  for (const [field, names] of Object.entries(departed)) {
    if (names.length > 0) {
      fields[field] =
        `${nameList.format(names)} left the household. Uncheck ${names.length === 1 ? "them" : "everyone who left"} to save.`;
    }
  }
  if (unplaced.length > 0) {
    return { fields, form: unplaced.join(" ") };
  }
  if (Object.keys(fields).length > 0) {
    return { fields };
  }
  return { fields, form: errorMessage(error) };
}
