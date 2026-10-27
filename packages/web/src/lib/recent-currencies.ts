import { CurrencyCode } from "@homesplit/contracts";
import { DEFAULT_CURRENCY } from "@/lib/money";

const STORAGE_KEY = "homesplit:recent-currencies";
const MAX_RECENT = 5;

/** Currencies the user picked lately on this device, most recent first. */
export function readRecentCurrencies(): string[] {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]"
    );
    return Array.isArray(stored)
      ? stored.filter((code) => CurrencyCode.safeParse(code).success)
      : [];
  } catch {
    return [];
  }
}

export function rememberCurrency(code: string): void {
  const recent = [code, ...readRecentCurrencies().filter((c) => c !== code)];
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    );
  } catch {
    // No storage, as in some private modes: the picker just doesn't remember.
  }
}

const LAST_BY_HOUSEHOLD_KEY = "homesplit:last-expense-currency";

function readLastByHousehold(): Record<string, unknown> {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(LAST_BY_HOUSEHOLD_KEY) ?? "{}"
    );
    return stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The currency of the last expense added to the household on this device, or PLN. */
export function readLastExpenseCurrency(householdId: string): string {
  const code = readLastByHousehold()[householdId];
  return CurrencyCode.safeParse(code).success
    ? (code as string)
    : DEFAULT_CURRENCY;
}

export function rememberExpenseCurrency(
  householdId: string,
  code: string
): void {
  try {
    localStorage.setItem(
      LAST_BY_HOUSEHOLD_KEY,
      JSON.stringify({ ...readLastByHousehold(), [householdId]: code })
    );
  } catch {
    // No storage: the next expense starts in PLN.
  }
}
