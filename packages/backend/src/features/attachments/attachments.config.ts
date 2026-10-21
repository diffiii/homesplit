import { z } from "zod";

const MIB = 1024 * 1024;
// SigV4 presigned URLs can't outlive a week.
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

const positiveInt = (fallback: number, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(max).default(fallback)
  );

const AttachmentsEnv = z.object({
  ATTACHMENT_MAX_BYTES: positiveInt(10 * MIB),
  ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS: positiveInt(
    5 * 60,
    MAX_SIGNED_URL_TTL_SECONDS
  ),
  ATTACHMENT_UNREFERENCED_TTL_HOURS: positiveInt(24),
});

const env = AttachmentsEnv.safeParse(process.env);

if (!env.success) {
  throw new Error(`Invalid attachments config: ${z.prettifyError(env.error)}`);
}

export const attachmentsConfig = {
  /** Largest file an upload accepts. */
  maxBytes: env.data.ATTACHMENT_MAX_BYTES,
  /** How long a download URL stays valid. */
  downloadUrlTtlSeconds: env.data.ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS,
  /** How old an attachment that nothing references gets before cleanup deletes it. */
  unreferencedTtlHours: env.data.ATTACHMENT_UNREFERENCED_TTL_HOURS,
} as const;
