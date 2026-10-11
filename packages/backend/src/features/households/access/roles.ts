/** Better Auth's default roles, weakest first. */
export const HOUSEHOLD_ROLES = ["member", "admin", "owner"] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

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
