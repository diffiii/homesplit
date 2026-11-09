import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { FEATURE_IDS } from "../catalog";
import { UserSummary } from "../users";

/** Path params for routes scoped to a household as a whole. */
export const HouseholdIdParams = z.object({
  householdId: Id,
});
export type HouseholdIdParams = z.infer<typeof HouseholdIdParams>;

/** Compact household shape for lists that span several households. */
export const HouseholdSummary = z.object({
  id: Id,
  name: z.string().min(1),
});
export type HouseholdSummary = z.infer<typeof HouseholdSummary>;

/** Better Auth's default household roles, weakest first. */
export const HOUSEHOLD_ROLES = ["member", "admin", "owner"] as const;
export const HouseholdRole = z.enum(HOUSEHOLD_ROLES);
export type HouseholdRole = z.infer<typeof HouseholdRole>;

/**
 * Where an invitation stands. `expired` is a pending invitation past its
 * `expiresAt`; Better Auth stores it as `pending`.
 */
export const InvitationStatus = z.enum([
  "pending",
  "accepted",
  "rejected",
  "canceled",
  "expired",
]);
export type InvitationStatus = z.infer<typeof InvitationStatus>;

/** How long an invitation link works: the backend's `invitationExpiresIn`, and what the web says. */
export const INVITATION_EXPIRY_DAYS = 7;

/** Path params for routes scoped to one invitation. */
export const InvitationIdParams = z.object({
  invitationId: Id,
});
export type InvitationIdParams = z.infer<typeof InvitationIdParams>;

/**
 * What the invitation page shows before the invitee answers. Anyone else
 * holding the link sees the address masked, as `j•••@gmail.com`, enough to
 * pick the right account, and once the invitation can't be answered, neither
 * the household nor the inviter.
 */
export const InvitationPreview = z.object({
  id: Id,
  /** Null for anyone but the invitee once the invitation isn't `pending`. */
  household: HouseholdSummary.nullable(),
  /** Null when `household` is. */
  inviter: UserSummary.nullable(),
  /** The invited address for the invitee; masked for anyone else. */
  email: z.string().min(1),
  role: HouseholdRole,
  status: InvitationStatus,
  expiresAt: IsoDateTime,
});
export type InvitationPreview = z.infer<typeof InvitationPreview>;

/** Per-household feature toggles; `ai` defaults to disabled at persistence time, the rest to enabled. */
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
