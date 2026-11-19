import { z } from "zod";

/** Unset and empty variables both mean "use the default". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional()
  );

const int = (fallback: number, min: number, max: number) =>
  optional(z.coerce.number().int().min(min).max(max)).default(fallback);

const AiEnv = z.object({
  AI_DRIVER: optional(z.literal("fake")),
  AI_BASE_URL: optional(z.url({ protocol: /^https?$/u })),
  AI_API_KEY: optional(z.string().min(1)),
  AI_TEXT_MODEL: optional(z.string().min(1)),
  AI_VISION_MODEL: optional(z.string().min(1)),
  AI_TIMEOUT_MS: int(30_000, 1000, 600_000),
  AI_MAX_RETRIES: int(2, 0, 5),
  AI_DAILY_REQUEST_LIMIT: int(50, 1, 100_000),
});

export interface OpenAiCompatibleConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries: number;
  models: { text: string; vision: string };
  timeoutMs: number;
}

export interface AiConfig {
  dailyRequestLimit: number;
  fake: boolean;
  /** `null` when any setting is missing, which turns AI off. */
  provider: OpenAiCompatibleConfig | null;
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const result = AiEnv.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid AI config: ${z.prettifyError(result.error)}`);
  }
  const {
    AI_BASE_URL: baseUrl,
    AI_API_KEY: apiKey,
    AI_TEXT_MODEL: text,
    AI_VISION_MODEL: vision,
    ...rest
  } = result.data;
  return {
    dailyRequestLimit: rest.AI_DAILY_REQUEST_LIMIT,
    fake: rest.AI_DRIVER === "fake",
    provider:
      baseUrl && apiKey && text && vision
        ? {
            baseUrl,
            apiKey,
            models: { text, vision },
            timeoutMs: rest.AI_TIMEOUT_MS,
            maxRetries: rest.AI_MAX_RETRIES,
          }
        : null,
  };
}

export const aiConfig = loadAiConfig();

/**
 * The longest one `AiService.generate` call can wait on the provider:
 * `OpenAiCompatibleAiClient` gives each call one `AbortSignal.timeout`, which
 * also ends the SDK's retries, so it's `timeoutMs` however many retries run.
 * Zero without a provider. Callers that treat a long call as lost, such as
 * receipts, add their own margin on top.
 */
export const longestRequestMs = (config: AiConfig = aiConfig): number =>
  config.provider?.timeoutMs ?? 0;
