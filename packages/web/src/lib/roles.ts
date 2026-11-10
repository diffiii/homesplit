import { HOUSEHOLD_ROLES } from "@homesplit/contracts";
import type { HouseholdRole } from "@/lib/api/auth-client";

/** Household roles, strongest first, as menus list them. */
export const ROLES: readonly HouseholdRole[] = [...HOUSEHOLD_ROLES].reverse();

export const ROLE_LABEL: Record<HouseholdRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const WITH_ARTICLE: Record<HouseholdRole, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};
