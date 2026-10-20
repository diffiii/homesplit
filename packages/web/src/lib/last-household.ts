import { householdPath } from "@/components/shell/household-nav";

const STORAGE_KEY = "homesplit:last-household";

/** Where the households list and the first-run screen live. */
export const HOUSEHOLDS_PATH = "/households";

/** The household last opened on this device, if storage has one. */
export function readLastHousehold(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberHousehold(householdId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, householdId);
  } catch {
    // No storage, as in some private modes: the user lands on their first household.
  }
}

/**
 * Where a signed-in user lands: the first-run screen without households, and
 * otherwise the household they last opened here, or their first one when
 * they've left it or never opened one on this device.
 */
export function landingPath(
  householdIds: readonly string[],
  lastHouseholdId: string | null
): string {
  const [first] = householdIds;
  if (first === undefined) {
    return HOUSEHOLDS_PATH;
  }
  return householdPath(
    lastHouseholdId && householdIds.includes(lastHouseholdId)
      ? lastHouseholdId
      : first
  );
}
