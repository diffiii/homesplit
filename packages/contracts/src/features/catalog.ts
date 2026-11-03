import { z } from "zod";

/** Toggleable household modules (not always-on features like users/friends). */
export const FEATURE_IDS = ["expenses", "chores", "shopping", "ai"] as const;

export const FeatureId = z.enum(FEATURE_IDS);
export type FeatureId = z.infer<typeof FeatureId>;
