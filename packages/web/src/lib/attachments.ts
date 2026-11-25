import {
  ATTACHMENT_MIME_TYPES,
  type AttachmentMimeType,
  DEFAULT_ATTACHMENT_MAX_BYTES,
} from "@homesplit/contracts";
import { isApiRequestError } from "./api/api-error";
import { errorMessage } from "./api/error-message";

/**
 * Largest file the upload accepts. Set `NEXT_PUBLIC_ATTACHMENT_MAX_BYTES` to
 * the backend's `ATTACHMENT_MAX_BYTES` when that isn't the default.
 */
export const ATTACHMENT_MAX_BYTES =
  Number(process.env.NEXT_PUBLIC_ATTACHMENT_MAX_BYTES) ||
  DEFAULT_ATTACHMENT_MAX_BYTES;

/**
 * File extensions for each allowed type. Some browsers give HEIC photos an
 * empty or unknown MIME type, so the extension is the fallback.
 */
const EXTENSIONS: Record<AttachmentMimeType, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "application/pdf": ["pdf"],
};

/** The file picker's `accept`: every allowed MIME type and extension. */
export const ATTACHMENT_ACCEPT = [
  ...ATTACHMENT_MIME_TYPES,
  ...Object.values(EXTENSIONS)
    .flat()
    .map((extension) => `.${extension}`),
].join(",");

/** What each type is called on screen. */
export const ATTACHMENT_TYPE_LABELS: Record<AttachmentMimeType, string> = {
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
  "image/heic": "HEIC image",
  "application/pdf": "PDF document",
};

/** The allowed types, for telling users. */
export const ATTACHMENT_TYPE_NAMES = "JPEG, PNG, WebP, HEIC, or PDF";

/**
 * The allowed type `file` claims to be, by its MIME type or else its
 * extension. The backend checks the content itself.
 */
export function attachmentTypeOf(
  file: Pick<File, "name" | "type">
): AttachmentMimeType | null {
  const mimeType = ATTACHMENT_MIME_TYPES.find((type) => type === file.type);
  if (mimeType) {
    return mimeType;
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const byExtension = ATTACHMENT_MIME_TYPES.find(
    (type) => extension && EXTENSIONS[type].includes(extension)
  );
  return byExtension ?? null;
}

export function unsupportedTypeMessage(): string {
  return `This type of file isn't supported. Use ${ATTACHMENT_TYPE_NAMES}.`;
}

export function tooLargeMessage(maxBytes = ATTACHMENT_MAX_BYTES): string {
  return `This file is too large. Files can be up to ${formatFileSize(maxBytes)}.`;
}

/** Why `file` can't be uploaded, or `null` when it can. */
export function attachmentFileError(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes = ATTACHMENT_MAX_BYTES
): string | null {
  if (!attachmentTypeOf(file)) {
    return unsupportedTypeMessage();
  }
  if (file.size === 0) {
    return "This file is empty.";
  }
  if (file.size > maxBytes) {
    return tooLargeMessage(maxBytes);
  }
  return null;
}

/** A sentence for a failed upload, saying what was wrong with the file when the server rejected it. */
export function uploadErrorMessage(error: unknown): string {
  if (isApiRequestError(error)) {
    if (error.status === 413) {
      return tooLargeMessage();
    }
    if (error.status === 415) {
      return unsupportedTypeMessage();
    }
  }
  return errorMessage(error);
}

/** A sentence for a file that couldn't be attached to an expense, saying the limit when it was reached. */
export function attachErrorMessage(error: unknown): string {
  if (
    isApiRequestError(error) &&
    error.code === "EXPENSE_ATTACHMENT_LIMIT_REACHED"
  ) {
    const limit = (error.details as { limit?: unknown } | undefined)?.limit;
    return typeof limit === "number"
      ? `An expense can have up to ${limit} files.`
      : "This expense can't have any more files.";
  }
  return errorMessage(error);
}

const KIB = 1024;
const MIB = KIB * KIB;

/** A file size in KB or MB, counting 1024 bytes to a KB as file managers do. */
export function formatFileSize(bytes: number, locale = "en"): string {
  const [value, unit] =
    bytes >= MIB ? [bytes / MIB, "megabyte"] : [bytes / KIB, "kilobyte"];
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
