import { readFileSync } from "node:fs";
import {
  ATTACHMENT_UPLOAD_FIELD,
  ExpenseCategoryListResponse,
  ExpenseCategorySuggestion,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiClient, type AiInput } from "@/ai/ai-client";
import { FakeAiClient } from "@/ai/fake-ai-client";
import { db } from "@/db";
import { aiUsage, expenseCategories } from "@/db/schema";
import { SUGGEST_CATEGORY_TASK } from "@/features/expense-categories/category-suggestions.service";
import { expectApiError } from "./helpers/api";
import { createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

type Member = TestUser & { household: TestHousehold };

const suggestionPath = (householdId: string) =>
  `/api/households/${householdId}/expense-categories/suggestion`;

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
/** A HEIC header with no image in it. */
const BROKEN_HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypheic"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("mif1heic"),
]);
const PHOTO_HEIC = readFileSync("test/fixtures/photo.heic");

/** A transparent 3000×1000 PNG, larger than the model's 2048px limit. */
const largePng = () =>
  sharp({
    create: {
      width: 3000,
      height: 1000,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();

describe("category suggestions", () => {
  let app: INestApplication;
  let fake: FakeAiClient;

  beforeAll(async () => {
    app = await createTestApp();
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
  });

  /** The model's reply, as list positions the prompt numbered from 1. */
  const reply = (category: unknown, confidence = "high") =>
    fake.on(SUGGEST_CATEGORY_TASK, () => ({ category, confidence }));

  async function optIn({ client, household }: Member): Promise<void> {
    await client
      .patch(`/api/households/${household.id}/features`)
      .send({ ai: true })
      .expect(200);
  }

  async function setup({ ai = true } = {}): Promise<Member> {
    const alice = await createUser(app, "Alice");
    const member = { ...alice, household: await createHousehold(alice) };
    if (ai) {
      await optIn(member);
    }
    return member;
  }

  const suggest = ({ client, household }: Member, body: object) =>
    client.post(suggestionPath(household.id)).send(body);

  async function categories({ client, household }: Member) {
    const response = await client
      .get(`/api/households/${household.id}/expense-categories`)
      .expect(200);
    return ExpenseCategoryListResponse.parse(response.body).items;
  }

  async function upload({ client, household }: Member, file: Buffer) {
    const response = await client
      .post(`/api/households/${household.id}/attachments`)
      .attach(ATTACHMENT_UPLOAD_FIELD, file, "file")
      .expect(201);
    return response.body.id as string;
  }

  async function usage({ household }: Member): Promise<number> {
    const rows = await db
      .select({ requests: aiUsage.requests })
      .from(aiUsage)
      .where(eq(aiUsage.organizationId, household.id));
    return rows.reduce((sum, row) => sum + row.requests, 0);
  }

  const sentInput = (): AiInput[] => {
    expect(fake.requests).toHaveLength(1);
    return [...(fake.requests[0]?.input ?? [])];
  };

  const sentPrompt = () => {
    const [text] = sentInput();
    if (text?.type !== "text") {
      throw new Error("Expected the prompt first");
    }
    return JSON.parse(text.text);
  };

  it("suggests the household's category the model picked", async () => {
    const alice = await setup();
    const items = await categories(alice);
    const position =
      items.findIndex((category) => category.name === "Groceries") + 1;
    const groceries = items[position - 1];
    reply(position, "high");

    const response = await suggest(alice, {
      name: "Lidl",
      description: "Weekly shop",
    }).expect(200);

    expect(ExpenseCategorySuggestion.parse(response.body)).toEqual({
      suggestion: { categoryId: groceries?.id, confidence: "high" },
    });
    expect(await usage(alice)).toBe(1);
  });

  it("sends category names and the expense text, but no IDs or user names", async () => {
    const alice = await setup();
    const names = (await categories(alice)).map((category) => category.name);
    reply(null);

    await suggest(alice, { name: "Lidl", description: null }).expect(200);

    expect(sentPrompt()).toEqual({
      categories: names.map((name, index) => ({ number: index + 1, name })),
      expense: { name: "Lidl", description: null },
    });
    const sent = JSON.stringify(fake.requests[0]?.input);
    expect(sent).not.toContain(alice.household.id);
    expect(sent).not.toContain(alice.id);
    expect(sent).not.toContain("Alice");
  });

  it("cuts long text before sending it", async () => {
    const alice = await setup();
    reply(null);

    await suggest(alice, {
      name: "n".repeat(500),
      description: "d".repeat(5000),
    }).expect(200);

    const { expense } = sentPrompt();
    expect(expense.name).toHaveLength(200);
    expect(expense.description).toHaveLength(2000);
  });

  it("answers null when no category fits", async () => {
    const alice = await setup();
    reply(null, "low");

    const response = await suggest(alice, { name: "asdf" }).expect(200);

    expect(response.body).toEqual({ suggestion: null });
  });

  it.each([0, 8, 99, -1, 1.5])(
    "discards a category the household doesn't have (%s)",
    async (category) => {
      const alice = await setup();
      reply(category);

      const response = await suggest(alice, { name: "Lidl" }).expect(200);

      expect(response.body).toEqual({ suggestion: null });
    }
  );

  it("answers AI_INVALID_OUTPUT when the reply fails the schema", async () => {
    const alice = await setup();
    reply("Groceries");

    expectApiError(
      await suggest(alice, { name: "Lidl" }).expect(502),
      "AI_INVALID_OUTPUT"
    );
  });

  it("answers null without calling the model when the household has no categories", async () => {
    const alice = await setup();
    await db
      .delete(expenseCategories)
      .where(eq(expenseCategories.householdId, alice.household.id));
    reply(1);

    const response = await suggest(alice, { name: "Lidl" }).expect(200);

    expect(response.body).toEqual({ suggestion: null });
    expect(fake.requests).toEqual([]);
    expect(await usage(alice)).toBe(0);
  });

  describe("attachments", () => {
    it("sends an image as a JPEG within 2048px", async () => {
      const alice = await setup();
      const attachmentId = await upload(alice, await largePng());
      reply(null);

      await suggest(alice, { attachmentId }).expect(200);

      const [prompt, image] = sentInput();
      expect(JSON.parse(prompt?.type === "text" ? prompt.text : "")).toEqual(
        expect.objectContaining({
          expense: { name: null, description: null },
        })
      );
      expect(image).toMatchObject({ type: "image", mimeType: "image/jpeg" });
      const metadata = await sharp(
        Buffer.from(image?.type === "image" ? image.data : [])
      ).metadata();
      expect(metadata).toMatchObject({
        format: "jpeg",
        width: 2048,
        height: 683,
      });
    });

    it("converts HEIC photos to JPEG", async () => {
      const alice = await setup();
      const attachmentId = await upload(alice, PHOTO_HEIC);
      reply(null);

      await suggest(alice, { name: "Receipt", attachmentId }).expect(200);

      expect(sentInput()[1]).toMatchObject({
        type: "image",
        mimeType: "image/jpeg",
      });
    });

    it("sends a PDF as it is", async () => {
      const alice = await setup();
      const attachmentId = await upload(alice, PDF);
      reply(null);

      await suggest(alice, { attachmentId }).expect(200);

      expect(sentInput()[1]).toEqual({
        type: "file",
        mimeType: "application/pdf",
        data: PDF,
      });
    });

    it("answers 415 for an image it can't read, without using the quota", async () => {
      const alice = await setup();
      const attachmentId = await upload(alice, BROKEN_HEIC);
      reply(null);

      const response = await suggest(alice, { attachmentId }).expect(415);

      expectApiError(response, "UNSUPPORTED_FILE_TYPE");
      expect(fake.requests).toEqual([]);
      expect(await usage(alice)).toBe(0);
    });

    it.each([
      ["another household's", true],
      ["a missing", false],
    ])("rejects %s attachment", async (_, foreign) => {
      const { alice, bob } = await createTwoHouseholds(app);
      await optIn(alice);
      const attachmentId = foreign
        ? await upload(bob, PDF)
        : "6f1c2b9e-0d4a-4c3b-8e7f-5a6b7c8d9e0f";
      reply(1);

      const response = await suggest(alice, { attachmentId }).expect(400);

      expectApiError(response, "INVALID_REFERENCE");
      expect(response.body.details).toEqual({
        issues: [{ path: ["attachmentId"], message: "Unknown attachment" }],
      });
      expect(fake.requests).toEqual([]);
      expect(await usage(alice)).toBe(0);
    });
  });

  describe("access", () => {
    it("answers 404 to a non-member", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await optIn(alice);

      await bob.client
        .post(suggestionPath(alice.household.id))
        .send({ name: "Lidl" })
        .expect(404);
    });

    it("needs the ai module, even without categories", async () => {
      const alice = await setup({ ai: false });
      await db
        .delete(expenseCategories)
        .where(eq(expenseCategories.householdId, alice.household.id));

      const response = await suggest(alice, { name: "Lidl" }).expect(403);

      expectApiError(response, "MODULE_DISABLED");
      expect(response.body.details).toEqual({ module: "ai" });
    });

    it("needs the expenses module", async () => {
      const alice = await setup();
      await alice.client
        .patch(`/api/households/${alice.household.id}/features`)
        .send({ expenses: false })
        .expect(200);

      const response = await suggest(alice, { name: "Lidl" }).expect(403);

      expectApiError(response, "MODULE_DISABLED");
      expect(response.body.details).toEqual({ module: "expenses" });
    });

    it.each([
      {},
      { name: null, description: null, attachmentId: null },
      { name: "" },
      { name: "Lidl", categoryId: "6f1c2b9e-0d4a-4c3b-8e7f-5a6b7c8d9e0f" },
    ])("rejects %o with VALIDATION_ERROR", async (body) => {
      const alice = await setup();

      expectApiError(
        await suggest(alice, body).expect(400),
        "VALIDATION_ERROR"
      );
      expect(await usage(alice)).toBe(0);
    });
  });
});
