import {
  FEATURE_IDS,
  type FeatureId,
  type HouseholdFeatures,
  type UpdateHouseholdFeaturesRequest,
} from "@homesplit/contracts";
import type { householdFeatures } from "@/db/schema";

type FeatureFlagColumns = Pick<
  typeof householdFeatures.$inferSelect,
  "expensesEnabled" | "choresEnabled" | "shoppingEnabled"
>;

const FEATURE_COLUMNS = {
  expenses: "expensesEnabled",
  chores: "choresEnabled",
  shopping: "shoppingEnabled",
} as const satisfies Record<FeatureId, keyof FeatureFlagColumns>;

export function rowToHouseholdFeatures(
  row: FeatureFlagColumns
): HouseholdFeatures {
  return Object.fromEntries(
    FEATURE_IDS.map((id) => [id, row[FEATURE_COLUMNS[id]]])
  ) as HouseholdFeatures;
}

export function patchToFeatureSet(
  patch: UpdateHouseholdFeaturesRequest
): Partial<FeatureFlagColumns> {
  const set: Partial<FeatureFlagColumns> = {};
  for (const id of FEATURE_IDS) {
    const value = patch[id];
    if (value !== undefined) {
      set[FEATURE_COLUMNS[id]] = value;
    }
  }
  return set;
}

export function isModuleEnabled(
  row: FeatureFlagColumns,
  module: FeatureId
): boolean {
  return row[FEATURE_COLUMNS[module]];
}
