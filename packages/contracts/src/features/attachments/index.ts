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

/** Multipart form field that carries the file in an upload. */
export const ATTACHMENT_UPLOAD_FIELD = "file";

/** A file stored for a household. Where it's stored is never exposed. */
export const Attachment = z.object({
  id: Id,
  householdId: Id,
  mimeType: AttachmentMimeType,
  sizeBytes: z.int().positive(),
  uploadedBy: UserSummary,
  createdAt: IsoDateTime,
});
export type Attachment = z.infer<typeof Attachment>;

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
