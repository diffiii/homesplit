import {
  MAX_AMOUNT_CENTS,
  MAX_RECEIPT_ITEMS,
  MAX_RECEIPT_QUANTITY,
  MAX_RECEIPT_TEXT_LENGTH,
  type Receipt,
  type ReceiptFailureCode,
  type ReceiptStatus,
  type UpdateReceiptRequest,
} from "@homesplit/contracts";
import type { ServerErrors } from "./form";
import {
  currencyExponent,
  decimalString,
  formatMoney,
  parseDecimal,
} from "./money";

/** Minor-unit digits while the currency is unknown, as the backend assumes. */
const UNKNOWN_CURRENCY_EXPONENT = 2;

/** Decimals a quantity may have, as the `numeric(12, 3)` column keeps. */
const QUANTITY_EXPONENT = 3;
const QUANTITY_SCALE = 10 ** QUANTITY_EXPONENT;

/** The first wait between polls of a receipt being read, then 1.5 times longer each time. */
export const RECEIPT_POLL_FIRST_MS = 1000;
/** The longest wait between polls, so a slow read still shows up soon after it's done. */
export const RECEIPT_POLL_MAX_MS = 5000;
const RECEIPT_POLL_FACTOR = 1.5;

/**
 * How long to wait before asking again about a receipt still being read,
 * after `fetches` answers: 1 s, 1.5 s, 2.25 s, and so on up to 5 s.
 */
export function receiptPollDelay(fetches: number): number {
  const delay =
    RECEIPT_POLL_FIRST_MS * RECEIPT_POLL_FACTOR ** Math.max(0, fetches - 1);
  return Math.min(Math.round(delay), RECEIPT_POLL_MAX_MS);
}

/** What the list and the receipt's page call each status. */
export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  processing: "Reading",
  ready: "Draft",
  failed: "Couldn't read",
  confirmed: "Added as an expense",
};

/** Why reading failed, in words, with what the member can do next. */
const FAILURE_MESSAGES: Record<ReceiptFailureCode, string> = {
  MODULE_DISABLED:
    "AI is turned off for this household, so the receipt can't be read. An admin can turn it on in settings.",
  AI_UNAVAILABLE: "Reading receipts isn't available right now.",
  AI_LIMIT_EXCEEDED:
    "The household has used up today's AI requests. You can try again tomorrow.",
  AI_TIMEOUT: "Reading the receipt took too long.",
  AI_PROVIDER_ERROR: "The AI provider couldn't read the receipt.",
  AI_INVALID_OUTPUT: "The receipt couldn't be read reliably.",
  UNSUPPORTED_FILE_TYPE: "The file couldn't be opened as an image.",
  NOT_A_RECEIPT: "This doesn't look like a receipt.",
  EXTRACTION_INTERRUPTED: "Reading the receipt was interrupted.",
  EXTRACTION_FAILED: "Something went wrong while reading the receipt.",
};

export function failureMessage(code: ReceiptFailureCode | null): string {
  return FAILURE_MESSAGES[code ?? "EXTRACTION_FAILED"];
}

/** The minor-unit digits of a receipt's amounts: its currency's, or 2 while it's unknown. */
export function receiptExponent(currency: string | null): number {
  return currency ? currencyExponent(currency) : UNKNOWN_CURRENCY_EXPONENT;
}

/** An amount in the receipt's currency, or a plain number while it's unknown. */
export function formatReceiptAmount(
  cents: number,
  currency: string | null
): string {
  return currency
    ? formatMoney({ amountCents: cents, currency })
    : decimalString(cents, UNKNOWN_CURRENCY_EXPONENT);
}

/** What the list shows for a receipt the model couldn't name yet. */
export function receiptTitle({ merchant }: Pick<Receipt, "merchant">): string {
  return merchant ?? "Unnamed receipt";
}

/** One item as the form edits it: every number as typed. */
export interface ReceiptItemValues {
  discount: string;
  /** The item's ID; new items have none until they're saved. */
  id?: string;
  /** A React key that stays the same while items move. */
  key: string;
  name: string;
  quantity: string;
  total: string;
  unitPrice: string;
}

export interface ReceiptDraftValues {
  currency: string;
  /** Discounts on the whole receipt, apart from the item discounts. */
  discount: string;
  items: ReceiptItemValues[];
  merchant: string;
  purchasedOn: string;
  total: string;
}

let lastKey = 0;

/** A blank item for the form, keyed apart from saved items, which use their ID. */
export function newItemValues(): ReceiptItemValues {
  lastKey += 1;
  return {
    key: `new-${lastKey}`,
    name: "",
    quantity: "1",
    unitPrice: "",
    discount: "",
    total: "",
  };
}

/** The draft as the form starts out: what the model read, or what was saved last. */
export function receiptDraftValues(receipt: Receipt): ReceiptDraftValues {
  const exponent = receiptExponent(receipt.currency);
  return {
    merchant: receipt.merchant ?? "",
    purchasedOn: receipt.purchasedOn ?? "",
    currency: receipt.currency ?? "",
    total:
      receipt.totalCents === null
        ? ""
        : decimalString(receipt.totalCents, exponent),
    discount:
      receipt.discountCents === 0
        ? ""
        : decimalString(receipt.discountCents, exponent),
    items: receipt.items.map((item) => ({
      key: item.id,
      id: item.id,
      name: item.name,
      quantity: String(item.quantity),
      unitPrice: decimalString(item.unitPriceCents, exponent),
      discount:
        item.discountCents === 0
          ? ""
          : decimalString(item.discountCents, exponent),
      total: decimalString(item.totalCents, exponent),
    })),
  };
}

/** A non-negative amount in minor units, or `null` when the input isn't one. */
export function parseReceiptAmount(
  input: string,
  exponent: number
): number | null {
  const result = parseDecimal(input, exponent);
  return result.ok && result.cents <= MAX_AMOUNT_CENTS ? result.cents : null;
}

/** A positive quantity with up to three decimals, or `null` when the input isn't one. */
export function parseQuantity(input: string): number | null {
  const result = parseDecimal(input, QUANTITY_EXPONENT);
  if (!result.ok || result.cents <= 0) {
    return null;
  }
  const quantity = result.cents / QUANTITY_SCALE;
  return quantity <= MAX_RECEIPT_QUANTITY ? quantity : null;
}

/** What's wrong with an amount, or `undefined`; a blank one is fine unless `required`. */
function amountError(
  input: string,
  exponent: number,
  { required }: { required: boolean }
): string | undefined {
  const result = parseDecimal(input, exponent);
  if (result.ok) {
    return result.cents > MAX_AMOUNT_CENTS
      ? "That amount is too large."
      : undefined;
  }
  switch (result.reason) {
    case "empty":
      return required ? "Enter an amount." : undefined;
    case "too-precise":
      return exponent === 0
        ? "Use a whole number."
        : `Use at most ${exponent} decimals.`;
    case "too-large":
      return "That amount is too large.";
    default:
      return "Enter a number, like 12.50.";
  }
}

function quantityError(input: string): string | undefined {
  if (!input.trim()) {
    return "Enter a quantity.";
  }
  const result = parseDecimal(input, QUANTITY_EXPONENT);
  if (!result.ok) {
    return result.reason === "too-precise"
      ? "Use at most 3 decimals."
      : "Enter a number, like 1 or 0.452.";
  }
  if (result.cents <= 0) {
    return "Enter more than 0.";
  }
  return parseQuantity(input) === null ? "Enter a smaller number." : undefined;
}

function textError(
  input: string,
  { required }: { required: boolean }
): string | undefined {
  const text = input.trim();
  if (!text) {
    return required ? "Enter a name." : undefined;
  }
  return text.length > MAX_RECEIPT_TEXT_LENGTH
    ? `Use at most ${MAX_RECEIPT_TEXT_LENGTH} characters.`
    : undefined;
}

function itemErrors(
  item: ReceiptItemValues,
  index: number,
  exponent: number
): [string, string | undefined][] {
  const at = (field: string) => `items[${index}].${field}`;
  return [
    [at("name"), textError(item.name, { required: true })],
    [at("quantity"), quantityError(item.quantity)],
    [
      at("unitPrice"),
      amountError(item.unitPrice, exponent, { required: true }),
    ],
    [at("discount"), amountError(item.discount, exponent, { required: false })],
    [at("total"), amountError(item.total, exponent, { required: true })],
  ];
}

/**
 * Field errors by form field name, such as `items[0].total`. No amount may be
 * negative: a returned deposit belongs in the receipt's discount.
 */
export function validateReceiptDraft(
  values: ReceiptDraftValues
): ServerErrors | undefined {
  const exponent = receiptExponent(values.currency || null);
  const entries: [string, string | undefined][] = [
    ["merchant", textError(values.merchant, { required: false })],
    ["total", amountError(values.total, exponent, { required: false })],
    ["discount", amountError(values.discount, exponent, { required: false })],
    ...values.items.flatMap((item, index) => itemErrors(item, index, exponent)),
  ];
  const fields: Record<string, string> = {};
  for (const [name, message] of entries) {
    if (message) {
      fields[name] = message;
    }
  }
  const form =
    values.items.length > MAX_RECEIPT_ITEMS
      ? `A receipt can have up to ${MAX_RECEIPT_ITEMS} items.`
      : undefined;
  return Object.keys(fields).length > 0 || form ? { fields, form } : undefined;
}

/** The edit to send for values `validateReceiptDraft` accepted. */
export function toUpdateReceiptRequest(
  values: ReceiptDraftValues
): UpdateReceiptRequest {
  const exponent = receiptExponent(values.currency || null);
  const amount = (input: string) => parseReceiptAmount(input, exponent) ?? 0;
  return {
    merchant: values.merchant.trim() || null,
    purchasedOn: values.purchasedOn || null,
    currency: values.currency || null,
    totalCents: values.total.trim() ? amount(values.total) : null,
    discountCents: amount(values.discount),
    items: values.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name.trim(),
      quantity: parseQuantity(item.quantity) ?? 1,
      unitPriceCents: amount(item.unitPrice),
      discountCents: amount(item.discount),
      totalCents: amount(item.total),
    })),
  };
}

/**
 * The line total for a quantity, a unit price, and a discount, as typed, or
 * `null` while one of them isn't a valid number or the discount is larger.
 * It rounds half up, which most tills do; the member can still change it.
 */
export function lineTotal(
  item: Pick<ReceiptItemValues, "quantity" | "unitPrice" | "discount">,
  currency: string
): string | null {
  const exponent = receiptExponent(currency || null);
  const quantity = parseDecimal(item.quantity, QUANTITY_EXPONENT);
  const unitPrice = parseReceiptAmount(item.unitPrice, exponent);
  const discount = item.discount.trim()
    ? parseReceiptAmount(item.discount, exponent)
    : 0;
  if (
    !quantity.ok ||
    quantity.cents <= 0 ||
    unitPrice === null ||
    discount === null
  ) {
    return null;
  }
  const gross = Math.round((quantity.cents * unitPrice) / QUANTITY_SCALE);
  const total = gross - discount;
  return total >= 0 && total <= MAX_AMOUNT_CENTS
    ? decimalString(total, exponent)
    : null;
}

export interface DraftTotals {
  /** `itemsCents - discountCents - totalCents`, or `null` while the total is unknown. */
  differenceCents: number | null;
  discountCents: number;
  /** Items whose total isn't a valid amount yet, left out of `itemsCents`. */
  invalidItems: number;
  itemsCents: number;
  totalCents: number | null;
}

/** The sums the form shows as the member types, like the receipt's own `differenceCents`. */
export function draftTotals(values: ReceiptDraftValues): DraftTotals {
  const exponent = receiptExponent(values.currency || null);
  let itemsCents = 0;
  let invalidItems = 0;
  for (const item of values.items) {
    const total = parseReceiptAmount(item.total, exponent);
    if (total === null) {
      invalidItems += 1;
    } else {
      itemsCents += total;
    }
  }
  const discountCents = values.discount.trim()
    ? (parseReceiptAmount(values.discount, exponent) ?? 0)
    : 0;
  const totalCents = values.total.trim()
    ? parseReceiptAmount(values.total, exponent)
    : null;
  return {
    itemsCents,
    discountCents,
    totalCents,
    invalidItems,
    differenceCents:
      totalCents === null ? null : itemsCents - discountCents - totalCents,
  };
}

/** One sentence on whether the items add up to the receipt's total. */
export function differenceText(
  differenceCents: number | null,
  currency: string | null
): string {
  if (differenceCents === null) {
    return "Enter the receipt's total to check the items against it.";
  }
  if (differenceCents === 0) {
    return "The items add up to the total.";
  }
  const amount = formatReceiptAmount(Math.abs(differenceCents), currency);
  return differenceCents > 0
    ? `The items come to ${amount} more than the total.`
    : `The items come to ${amount} less than the total.`;
}
