import { z } from "zod";

import { Id } from "../../common/id";

/** Compact user shape for payers, assignees, friends, and member lists. */
export const UserSummary = z.object({
  id: Id,
  name: z.string().min(1),
  imageUrl: z.url().nullable(),
});
export type UserSummary = z.infer<typeof UserSummary>;

/** Display name a user sets at sign-up or in their profile, trimmed. */
export const DisplayName = z.string().trim().min(1).max(100);
export type DisplayName = z.infer<typeof DisplayName>;

/** Avatar link. Only https, so it can't hold a `javascript:` or `data:` URL. */
export const AvatarUrl = z.url({ protocol: /^https$/ });
export type AvatarUrl = z.infer<typeof AvatarUrl>;

/** Partial profile update (display name / avatar). */
export const UpdateProfileRequest = z.object({
  name: DisplayName.optional(),
  imageUrl: AvatarUrl.nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;
