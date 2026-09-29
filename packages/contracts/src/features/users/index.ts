import { z } from "zod";

import { Id } from "../../common/id";

/** Compact user shape for payers, assignees, friends, and member lists. */
export const UserSummary = z.object({
  id: Id,
  name: z.string().min(1),
  imageUrl: z.url().nullable(),
});
export type UserSummary = z.infer<typeof UserSummary>;

/** Partial profile update (display name / avatar). */
export const UpdateProfileRequest = z.object({
  name: z.string().min(1).optional(),
  imageUrl: z.url().nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;
