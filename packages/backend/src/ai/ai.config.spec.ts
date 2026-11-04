import { describe, expect, it } from "vitest";
import { loadAiConfig } from "./ai.config";

const COMPLETE = {
  AI_BASE_URL: "https://openrouter.ai/api/v1",
  AI_API_KEY: "test-key",
  AI_TEXT_MODEL: "text-cheap",
  AI_VISION_MODEL: "vision-cheap",
};

describe("loadAiConfig", () => {
  it("reads a complete configuration with defaults", () => {
    expect(loadAiConfig(COMPLETE)).toEqual({
      dailyRequestLimit: 50,
      fake: false,
      provider: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
        models: { text: "text-cheap", vision: "vision-cheap" },
        timeoutMs: 30_000,
        maxRetries: 2,
      },
    });
  });

  it.each(Object.keys(COMPLETE))(
    "disables AI instead of throwing when %s is missing",
    (name) => {
      expect(loadAiConfig({ ...COMPLETE, [name]: "" }).provider).toBeNull();
    }
  );

  it("uses the fake only when asked to", () => {
    expect(loadAiConfig({ AI_DRIVER: "fake" }).fake).toBe(true);
  });

  it.each([{ AI_DRIVER: "anthropic" }, { AI_TIMEOUT_MS: "soon" }])(
    "throws on malformed %o",
    (env) => {
      expect(() => loadAiConfig(env)).toThrow("Invalid AI config");
    }
  );
});
