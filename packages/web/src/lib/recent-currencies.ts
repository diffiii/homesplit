import { CurrencyCode } from "@homesplit/contracts";

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
