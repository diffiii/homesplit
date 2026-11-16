"use client";

import type {
  FeatureId,
  HouseholdFeatures,
  Settlement,
  UserSummary,
} from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";
import type { HouseholdRole } from "@/lib/api/auth-client";
import { pendingSettlementsQuery } from "@/lib/api/expense-queries";
import type {
  HouseholdDetails,
  HouseholdMember,
} from "@/lib/api/household-queries";
import {
  isDeparted,
  type Permissions,
  permissionsFor,
} from "@/lib/permissions";

/** What the shell loads once for every page of a household. */
export interface HouseholdData {
  features: HouseholdFeatures;
  household: HouseholdDetails;
  members: readonly HouseholdMember[];
  /** The signed-in user's strongest role in the household. */
  role: HouseholdRole;
  /** The signed-in user. */
  userId: string;
}

export const HouseholdContext = createContext<HouseholdData | null>(null);

/**
 * The household of the page being shown, from `/households/:householdId/...`,
 * with its members, module flags, and the caller's role. Pages render only
 * once all of it has loaded, and it stays fresh as the shell refetches it.
 */
export function useHousehold(): HouseholdData {
  const data = use(HouseholdContext);
  if (!data) {
    throw new Error("useHousehold must be used inside the household shell");
  }
  return data;
}

export function useHouseholdId(): string {
  return useHousehold().household.id;
}

/**
 * Whether a module accepts changes. Its screens stay readable while it's off,
 * and the API answers `MODULE_DISABLED` to writes.
 */
export function useFeatureEnabled(feature: FeatureId): boolean {
  return useHousehold().features[feature];
}

/** What the caller may do here; see `permissionsFor`. */
export function usePermissions(): Permissions {
  const { userId, role, members } = useHousehold();
  return useMemo(
    () => permissionsFor({ userId, role }, members),
    [userId, role, members]
  );
}

/** Pending payments waiting for the caller; none while the expenses module is off. */
export function useWaitingPayments(): Settlement[] {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const can = usePermissions();
  const { data } = useQuery({
    ...pendingSettlementsQuery(householdId),
    enabled,
  });
  return enabled ? (data?.items ?? []).filter(can.awaitsConfirmation) : [];
}

/** Whether a user shown in the household's history has left it. */
export function useIsDeparted(): (user: Pick<UserSummary, "id">) => boolean {
  const { members } = useHousehold();
  return (user) => isDeparted(user, members);
}

/** A user's name as plain text, with " (left)" once they've left the household. */
export function useUserName(): (
  user: Pick<UserSummary, "id" | "name">
) => string {
  const hasLeft = useIsDeparted();
  return (user) => `${user.name}${hasLeft(user) ? " (left)" : ""}`;
}
