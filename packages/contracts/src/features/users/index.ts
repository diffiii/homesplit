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

/**
 * Avatar link. Only https, so it can't hold a `javascript:` or `data:` URL.
 * The backend also requires it to be the caller's own uploaded avatar.
 */
export const AvatarUrl = z.url({ protocol: /^https$/u });
export type AvatarUrl = z.infer<typeof AvatarUrl>;

/** File types an avatar upload may have, detected from the file's content. */
export const AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const AvatarMimeType = z.enum(AVATAR_MIME_TYPES);
export type AvatarMimeType = z.infer<typeof AvatarMimeType>;

/**
 * Largest avatar upload when the backend's `AVATAR_MAX_BYTES` isn't set:
 * 10 MiB. The web app checks images against the same limit before uploading.
 */
export const DEFAULT_AVATAR_MAX_BYTES = 10 * 1024 * 1024;

/** Multipart form field that carries the image in an avatar upload. */
export const AVATAR_UPLOAD_FIELD = "file";

/** Partial profile update (display name / avatar). */
export const UpdateProfileRequest = z.object({
  name: DisplayName.optional(),
  imageUrl: AvatarUrl.nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;
