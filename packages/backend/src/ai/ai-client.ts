import type { z } from "zod";
import { AppError } from "@/http/app-error";

export type AiInput =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: Uint8Array };

export interface AiRequest<T extends z.ZodType> {
  readonly input: readonly AiInput[];
  readonly instructions: string;
  /**
   * What the reply must parse as, sent to the provider as a strict JSON
   * schema: use `.nullable()` rather than `.optional()`, and no transforms.
   */
  readonly output: T;
  readonly task: string;
}

/** `null` when the AI settings are missing. */
export abstract class AiClient {
  abstract generate<T extends z.ZodType>(
    request: AiRequest<T>
  ): Promise<z.output<T>>;
}

export const aiProviderError = (): AppError =>
  new AppError(502, "AI_PROVIDER_ERROR", "AI provider request failed");

export const aiInvalidOutput = (): AppError =>
  new AppError(502, "AI_INVALID_OUTPUT", "AI provider returned invalid output");

export const aiTimeout = (): AppError =>
  new AppError(504, "AI_TIMEOUT", "AI provider timed out");
