import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiClient, aiTimeout } from "@/ai/ai-client";
import { FakeAiClient } from "@/ai/fake-ai-client";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { AI_PROBE_TASK, AiProbeModule, aiProbePath } from "./helpers/ai-probe";
import { expectApiError } from "./helpers/api";
import { createTestApp } from "./helpers/app";
import {
  createHousehold,
  createUser,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

/** `AI_DAILY_REQUEST_LIMIT` in vitest.config.mts. */
const DAILY_LIMIT = 3;

const today = () => new Date().toISOString().slice(0, 10);

type Member = TestUser & { household: TestHousehold };

describe("AI provider", () => {
  let app: INestApplication;
  let fake: FakeAiClient;

  beforeAll(async () => {
    app = await createTestApp(AiProbeModule);
    const client = app.get(AiClient);
    if (!(client instanceof FakeAiClient)) {
      throw new Error("Tests need AI_DRIVER=fake");
    }
    fake = client;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    fake.reset();
    fake.on(AI_PROBE_TASK, () => ({ answer: "42" }));
  });

  async function setup({ optIn = true } = {}): Promise<Member> {
    const alice = await createUser(app, "Alice");
    const household = await createHousehold(alice);
    if (optIn) {
      await alice.client
        .patch(`/api/households/${household.id}/features`)
        .send({ ai: true })
        .expect(200);
    }
    return { ...alice, household };
  }

  const ask = ({ client, household }: Member) =>
    client.post(aiProbePath(household.id)).send({ text: "Six times seven?" });

  async function usage({ household }: Member): Promise<number | undefined> {
    const [row] = await db
      .select({ requests: aiUsage.requests })
      .from(aiUsage)
      .where(
        and(eq(aiUsage.organizationId, household.id), eq(aiUsage.day, today()))
      );
    return row?.requests;
  }

  it("returns the validated reply and counts the request", async () => {
    const alice = await setup();

    const response = await ask(alice).expect(200);

    expect(response.body).toEqual({ answer: "42" });
    expect(fake.requests.map((request) => request.input)).toEqual([
      [{ type: "text", text: "Six times seven?" }],
    ]);
    expect(await usage(alice)).toBe(1);
  });

  it("sends nothing while the household hasn't opted in", async () => {
    const alice = await setup({ optIn: false });

    const response = await ask(alice).expect(403);

    expectApiError(response, "MODULE_DISABLED");
    expect(response.body.details).toEqual({ module: "ai" });
    expect(fake.requests).toEqual([]);
    expect(await usage(alice)).toBeUndefined();
  });

  it("rejects output that fails the schema with AI_INVALID_OUTPUT", async () => {
    const alice = await setup();
    fake.on(AI_PROBE_TASK, () => ({ answer: 42 }));

    expectApiError(await ask(alice).expect(502), "AI_INVALID_OUTPUT");
  });

  it("answers AI_TIMEOUT when the provider times out", async () => {
    const alice = await setup();
    fake.on(AI_PROBE_TASK, () => {
      throw aiTimeout();
    });

    expectApiError(await ask(alice).expect(504), "AI_TIMEOUT");
  });

  describe("daily limit", () => {
    it("answers AI_LIMIT_EXCEEDED over the limit, counting failed requests too", async () => {
      const alice = await setup();
      fake.on(AI_PROBE_TASK, () => ({ wrong: true }));
      await ask(alice).expect(502);
      fake.on(AI_PROBE_TASK, () => ({ answer: "42" }));
      await ask(alice).expect(200);
      await ask(alice).expect(200);

      const response = await ask(alice).expect(429);

      expectApiError(response, "AI_LIMIT_EXCEEDED");
      const midnight = new Date(`${today()}T00:00:00Z`);
      midnight.setUTCDate(midnight.getUTCDate() + 1);
      expect(response.body.details).toEqual({
        limit: DAILY_LIMIT,
        resetsAt: midnight.toISOString(),
      });
      expect(fake.requests).toHaveLength(DAILY_LIMIT);
    });

    it("starts again on a new UTC day", async () => {
      const alice = await setup();
      await db.insert(aiUsage).values({
        organizationId: alice.household.id,
        day: "2000-01-01",
        requests: DAILY_LIMIT,
      });

      await ask(alice).expect(200);
      expect(await usage(alice)).toBe(1);
    });

    it("never lets concurrent requests overshoot the limit", async () => {
      const alice = await setup();

      const statuses = await Promise.all(
        Array.from(
          { length: DAILY_LIMIT + 3 },
          async () => (await ask(alice)).status
        )
      );

      expect(statuses.filter((status) => status === 200)).toHaveLength(
        DAILY_LIMIT
      );
      expect(statuses.filter((status) => status === 429)).toHaveLength(3);
      expect(await usage(alice)).toBe(DAILY_LIMIT);
    });
  });
});
