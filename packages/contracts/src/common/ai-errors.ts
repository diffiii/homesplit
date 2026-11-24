import { z } from "zod";

/**
 * The error codes the backend's AI layer answers with: `ai` turned off, no
 * provider configured, the daily limit, the provider's own failures, and a
 * file the vision model can't be sent. Features that store an AI failure,
 * such as receipts, build their codes from this list.
 */
export const AI_ERROR_CODES = [
  "MODULE_DISABLED",
  "AI_UNAVAILABLE",
  "AI_LIMIT_EXCEEDED",
  "AI_TIMEOUT",
  "AI_PROVIDER_ERROR",
  "AI_INVALID_OUTPUT",
  "UNSUPPORTED_FILE_TYPE",
] as const;

export const AiErrorCode = z.enum(AI_ERROR_CODES);
export type AiErrorCode = z.infer<typeof AiErrorCode>;
