import { Logger } from "@nestjs/common";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import type { z } from "zod";
import { AppError } from "@/http/app-error";
import type { OpenAiCompatibleConfig } from "./ai.config";
import {
  AiClient,
  type AiInput,
  type AiRequest,
  aiInvalidOutput,
  aiProviderError,
  aiTimeout,
} from "./ai-client";

/** Keeps data away from endpoints that train on it, keep it, or ignore the schema. */
const OPENROUTER_ROUTING = {
  data_collection: "deny",
  require_parameters: true,
  zdr: true,
};

export class OpenAiCompatibleAiClient extends AiClient {
  private readonly logger = new Logger(OpenAiCompatibleAiClient.name);
  private readonly config: OpenAiCompatibleConfig;
  private readonly openai: OpenAI;

  constructor(
    config: OpenAiCompatibleConfig,
    options: { fetch?: typeof fetch } = {}
  ) {
    super();
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: config.maxRetries,
      fetch: options.fetch,
    });
  }

  async generate<T extends z.ZodType>(
    request: AiRequest<T>
  ): Promise<z.output<T>> {
    const needsVision = request.input.some((part) => part.type !== "text");
    const model = needsVision
      ? this.config.models.vision
      : this.config.models.text;
    const signal = AbortSignal.timeout(this.config.timeoutMs);

    try {
      const completion = await this.openai.chat.completions.parse(
        {
          model,
          messages: [
            { role: "system", content: request.instructions },
            { role: "user", content: request.input.map(toContentPart) },
          ],
          response_format: zodResponseFormat(request.output, request.task),
          ...(new URL(this.config.baseUrl).hostname === "openrouter.ai" && {
            provider: OPENROUTER_ROUTING,
          }),
        },
        { signal }
      );
      // A refusal parses to `null`.
      const parsed = completion.choices[0]?.message.parsed;
      if (parsed === null || parsed === undefined) {
        throw aiInvalidOutput();
      }
      return parsed as z.output<T>;
    } catch (error) {
      const failure = toAppError(error, signal);
      // Only the error's kind: messages can quote the reply, which holds household data.
      this.logger.warn(
        `AI task ${request.task} failed on ${model}: ${failure.code} (${kindOf(error)})`
      );
      throw failure;
    }
  }
}

function toAppError(error: unknown, signal: AbortSignal): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (signal.aborted) {
    return aiTimeout();
  }
  if (error instanceof OpenAI.APIError) {
    return aiProviderError();
  }
  return aiInvalidOutput();
}

function kindOf(error: unknown): string {
  if (error instanceof OpenAI.APIError && error.status) {
    return `status ${error.status}`;
  }
  return error instanceof Error ? error.name : typeof error;
}

function toContentPart(part: AiInput): ChatCompletionContentPart {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  const url = `data:${part.mimeType};base64,${Buffer.from(part.data).toString("base64")}`;
  if (part.type === "file") {
    return {
      type: "file",
      file: { filename: "attachment.pdf", file_data: url },
    };
  }
  return { type: "image_url", image_url: { url } };
}
