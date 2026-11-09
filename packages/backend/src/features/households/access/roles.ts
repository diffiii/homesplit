// One list for the API's responses and the checks here, weakest first.
import { HOUSEHOLD_ROLES, type HouseholdRole } from "@homesplit/contracts";

/**
 * The strongest role in a `member.role` value. Better Auth stores several
 * roles as a comma-separated string; unknown names are ignored.
 */
export function strongestRole(stored: string): HouseholdRole | null {
  const names = stored.split(",").map((name) => name.trim());
  return HOUSEHOLD_ROLES.findLast((role) => names.includes(role)) ?? null;
}

export function hasRole(
  role: HouseholdRole | null,
  minRole: HouseholdRole
): boolean {
  return (
    role !== null &&
    HOUSEHOLD_ROLES.indexOf(role) >= HOUSEHOLD_ROLES.indexOf(minRole)
  );
}
