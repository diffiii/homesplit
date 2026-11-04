import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { OpenAiCompatibleConfig } from "./ai.config";
import type { AiInput } from "./ai-client";
import { OpenAiCompatibleAiClient } from "./openai-compatible-ai-client";

const CONFIG: OpenAiCompatibleConfig = {
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "test-key",
  models: { text: "text-cheap", vision: "vision-cheap" },
  timeoutMs: 1000,
  maxRetries: 2,
};

const Output = z.object({ categoryId: z.string().nullable() });

const TEXT: AiInput[] = [{ type: "text", text: "Lidl groceries" }];

const request = (input: AiInput[] = TEXT) => ({
  task: "categorize-expense",
  instructions: "Pick a category.",
  input,
  output: Output,
});

const completion = (content: string, finishReason = "stop") =>
  Response.json({
    choices: [{ finish_reason: finishReason, message: { content } }],
  });

const ok = (value: unknown) => completion(JSON.stringify(value));

/** `retry-after-ms` keeps the SDK's backoff from slowing the tests down. */
const failure = (status: number) =>
  new Response(null, { status, headers: { "retry-after-ms": "1" } });

function setup(
  responses: Response[],
  config: Partial<OpenAiCompatibleConfig> = {}
) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) {
    fetch.mockResolvedValueOnce(response);
  }
  const client = new OpenAiCompatibleAiClient(
    { ...CONFIG, ...config },
    { fetch }
  );
  const sent = (call: number) => {
    const [url, init] = fetch.mock.calls[call] ?? [];
    return {
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string),
    };
  };
  return { client, fetch, sent };
}

describe("OpenAiCompatibleAiClient", () => {
  it("sends a strict JSON-schema request with OpenRouter's privacy routing", async () => {
    const { client, sent } = setup([ok({ categoryId: "food" })]);

    await expect(client.generate(request())).resolves.toEqual({
      categoryId: "food",
    });

    const { url, headers, body } = sent(0);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(body).toEqual({
      model: "text-cheap",
      messages: [
        { role: "system", content: "Pick a category." },
        { role: "user", content: [{ type: "text", text: "Lidl groceries" }] },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "categorize-expense",
          strict: true,
          schema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: { categoryId: { type: ["string", "null"] } },
            required: ["categoryId"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        data_collection: "deny",
        require_parameters: true,
        zdr: true,
      },
    });
  });

  it("sends plain requests to other providers", async () => {
    const { client, sent } = setup([ok({ categoryId: null })], {
      baseUrl: "http://localhost:11434/v1",
    });

    await client.generate(request());

    expect(sent(0).url).toBe("http://localhost:11434/v1/chat/completions");
    expect(sent(0).body).not.toHaveProperty("provider");
  });

  it("sends images as data URLs to the vision model", async () => {
    const { client, sent } = setup([ok({ categoryId: null })]);

    await client.generate(
      request([
        { type: "image", mimeType: "image/png", data: Buffer.from("png") },
      ])
    );

    expect(sent(0).body.model).toBe("vision-cheap");
    expect(sent(0).body.messages[1].content).toEqual([
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${btoa("png")}` },
      },
    ]);
  });

  it.each([
    ["fails the schema", ok({ categoryId: 7 })],
    ["is cut off", completion('{"categoryId": null}', "length")],
    [
      "is a refusal",
      Response.json({
        choices: [
          { finish_reason: "stop", message: { content: "{}", refusal: "No" } },
        ],
      }),
    ],
  ])("fails with AI_INVALID_OUTPUT when the reply %s", async (_, reply) => {
    const { client, fetch } = setup([reply]);

    await expect(client.generate(request())).rejects.toMatchObject({
      status: 502,
      code: "AI_INVALID_OUTPUT",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("retries server errors up to AI_MAX_RETRIES, then fails with AI_PROVIDER_ERROR", async () => {
    const { client, fetch } = setup(
      [failure(429), failure(500), failure(503)],
      { maxRetries: 2 }
    );

    await expect(client.generate(request())).rejects.toMatchObject({
      status: 502,
      code: "AI_PROVIDER_ERROR",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("fails with AI_TIMEOUT when the whole request runs out of time", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          );
        })
    );
    const client = new OpenAiCompatibleAiClient(
      { ...CONFIG, timeoutMs: 20 },
      { fetch }
    );

    await expect(client.generate(request())).rejects.toMatchObject({
      status: 504,
      code: "AI_TIMEOUT",
    });
  });
});
