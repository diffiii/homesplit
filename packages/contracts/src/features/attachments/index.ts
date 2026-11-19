import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { UserSummary } from "../users";

/** File types an attachment may have, detected from the file's content. */
export const ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export const AttachmentMimeType = z.enum(ATTACHMENT_MIME_TYPES);
export type AttachmentMimeType = z.infer<typeof AttachmentMimeType>;

/**
 * Largest upload when the backend's `ATTACHMENT_MAX_BYTES` isn't set: 10 MiB.
 * The web app checks files against the same limit before uploading.
 */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Multipart form field that carries the file in an upload. */
export const ATTACHMENT_UPLOAD_FIELD = "file";

/**
 * A file stored for a household. Where it's stored is never exposed.
 * `hasThumbnail` says whether `getAttachmentThumbnail` serves a preview.
 */
export const Attachment = z.object({
  id: Id,
  householdId: Id,
  mimeType: AttachmentMimeType,
  sizeBytes: z.int().positive(),
  hasThumbnail: z.boolean(),
  uploadedBy: UserSummary,
  createdAt: IsoDateTime,
});
export type Attachment = z.infer<typeof Attachment>;

/**
 * What an expense shows of each file linked to it. It has no download URL;
 * `getAttachmentDownload` issues one.
 */
export const AttachmentSummary = Attachment.pick({
  id: true,
  mimeType: true,
  sizeBytes: true,
  hasThumbnail: true,
});
export type AttachmentSummary = z.infer<typeof AttachmentSummary>;

/** A short-lived signed link to an attachment's content. */
export const AttachmentDownload = z.object({
  url: z.url(),
  expiresAt: IsoDateTime,
});
export type AttachmentDownload = z.infer<typeof AttachmentDownload>;

/** Path params for attachment-scoped routes. */
export const AttachmentIdParams = z.object({
  householdId: Id,
  attachmentId: Id,
});
export type AttachmentIdParams = z.infer<typeof AttachmentIdParams>;
