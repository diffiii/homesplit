import { z } from "zod";

import { FEATURE_IDS } from "../catalog";

/** Per-household feature toggles; all three default to enabled at persistence time. */
export const HouseholdFeatures = z.object(
  Object.fromEntries(FEATURE_IDS.map((id) => [id, z.boolean()])) as {
    [K in (typeof FEATURE_IDS)[number]]: z.ZodBoolean;
  }
);
export type HouseholdFeatures = z.infer<typeof HouseholdFeatures>;

/** Partial update of household feature toggles. */
export const UpdateHouseholdFeaturesRequest = HouseholdFeatures.partial();
export type UpdateHouseholdFeaturesRequest = z.infer<
  typeof UpdateHouseholdFeaturesRequest
>;
