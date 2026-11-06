import type { z } from "zod";
import { AiClient, type AiRequest, aiInvalidOutput } from "./ai-client";

/** Returns the raw reply, which is validated like a provider's; throw to fail the request. */
export type FakeAiHandler = (request: AiRequest<z.ZodType>) => unknown;

/** Deterministic `AiClient` for tests (`AI_DRIVER=fake`), scripted per task. */
export class FakeAiClient extends AiClient {
  readonly requests: AiRequest<z.ZodType>[] = [];
  private readonly handlers = new Map<string, FakeAiHandler>();

  on(task: string, handler: FakeAiHandler): this {
    this.handlers.set(task, handler);
    return this;
  }

  reset(): void {
    this.requests.length = 0;
    this.handlers.clear();
  }

  async generate<T extends z.ZodType>(
    request: AiRequest<T>
  ): Promise<z.output<T>> {
    this.requests.push(request);
    const handler = this.handlers.get(request.task);
    if (!handler) {
      throw new Error(`FakeAiClient has no reply for task ${request.task}`);
    }
    const result = request.output.safeParse(await handler(request));
    if (!result.success) {
      throw aiInvalidOutput();
    }
    return result.data;
  }
}
