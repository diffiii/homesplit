"use client";

import type { FeatureId } from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { endpointQuery } from "@/lib/api/queries";

export function useHouseholdFeatures(householdId: string) {
  return useQuery(
    endpointQuery("getHouseholdFeatures", { params: { householdId } })
  );
}

/**
 * Whether a module accepts changes. While the flags load, or if they fail to,
 * it counts as on: the API answers `MODULE_DISABLED` if it's actually off.
 */
export function useFeatureEnabled(
  householdId: string,
  feature: FeatureId
): boolean {
  return useHouseholdFeatures(householdId).data?.[feature] ?? true;
}
