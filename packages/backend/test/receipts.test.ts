import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  ATTACHMENT_UPLOAD_FIELD,
  Receipt,
  type ReceiptItem,
  ReceiptListResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiClient, aiTimeout } from "@/ai/ai-client";
import { FakeAiClient } from "@/ai/fake-ai-client";
import { db } from "@/db";
import { aiUsage, receiptItems, receipts } from "@/db/schema";
import { AttachmentsCleanupService } from "@/features/attachments/attachments-cleanup.service";
import {
  type ModelReceipt,
  SCAN_RECEIPT_TASK,
} from "@/features/receipts/receipt-draft";
import { ReceiptExtraction } from "@/features/receipts/receipt-extraction";
import { STALE_AFTER_MS } from "@/features/receipts/receipts.repository";
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

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
/** A complete 1×1 grayscale PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",
  "base64"
);
/** A HEIC header with no image in it. */
const BROKEN_HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypheic"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("mif1heic"),
]);

const HOUR_MS = 60 * 60 * 1000;

/** An item as an edit sends it back. */
const asInput = ({ position: _position, ...item }: ReceiptItem) => item;

const receiptsPath = (householdId: string) =>
  `/api/households/${householdId}/receipts`;
const receiptPath = (householdId: string, receiptId: string) =>
  `${receiptsPath(householdId)}/${receiptId}`;

/** A receipt whose items add up: 4.99 + 2 × 3.50 − 1.00 + 3.11 − 0.50. */
const GROCERIES: ModelReceipt = {
  isReceipt: true,
  merchant: "Biedronka",
  purchasedOn: "2026-11-02",
  currency: "PLN",
  total: 13.6,
  receiptDiscount: 0.5,
  items: [
    { name: "Milk", quantity: 1, unitPrice: 4.99, discount: null, total: 4.99 },
    { name: "Bread", quantity: 2, unitPrice: 3.5, discount: 1, total: 6 },
    {
      name: "Apples",
      quantity: 0.452,
      unitPrice: 6.89,
      discount: null,
      total: 3.11,
    },
  ],
};

describe("receipts", () => {
  let app: INestApplication;
  let fake: FakeAiClient;
  let extraction: ReceiptExtraction;

  beforeAll(async () => {
    app = await createTestApp();
    const client = app.get(AiClient);
    if (!(client instanceof FakeAiClient)) {
      throw new Error("Tests need AI_DRIVER=fake");
    }
    fake = client;
    extraction = app.get(ReceiptExtraction);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    fake.reset();
  });

  const reply = (body: unknown) => fake.on(SCAN_RECEIPT_TASK, () => body);

  /** Holds every reply until `open` is called. */
  function gatedReply(body: unknown): { open: () => void } {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    fake.on(SCAN_RECEIPT_TASK, async () => {
      await gate;
      return body;
    });
    return { open };
  }

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

  async function upload(
    { client, household }: Member,
    file: Buffer = PDF
  ): Promise<string> {
    const response = await client
      .post(`/api/households/${household.id}/attachments`)
      .attach(ATTACHMENT_UPLOAD_FIELD, file, "file")
      .expect(201);
    return response.body.id as string;
  }

  const scan = ({ client, household }: Member, attachmentId: string) =>
    client.post(receiptsPath(household.id)).send({ attachmentId });

  async function startScan(member: Member, file?: Buffer): Promise<Receipt> {
    const response = await scan(member, await upload(member, file)).expect(201);
    return Receipt.parse(response.body);
  }

  async function get({ client, household }: Member, receiptId: string) {
    const response = await client
      .get(receiptPath(household.id, receiptId))
      .expect(200);
    return Receipt.parse(response.body);
  }

  /** Polls the way a client does, until extraction has finished. */
  async function settled(
    member: Member,
    receiptId: string,
    attempts = 100
  ): Promise<Receipt> {
    const receipt = await get(member, receiptId);
    if (receipt.status !== "processing") {
      return receipt;
    }
    if (attempts <= 1) {
      throw new Error(`Receipt ${receiptId} is still processing`);
    }
    await sleep(20);
    return settled(member, receiptId, attempts - 1);
  }

  async function scanned(member: Member, file?: Buffer): Promise<Receipt> {
    const { id } = await startScan(member, file);
    return settled(member, id);
  }

  const update = (
    { client, household }: Member,
    receiptId: string,
    body: object
  ) => client.patch(receiptPath(household.id, receiptId)).send(body);

  const retry = ({ client, household }: Member, receiptId: string) =>
    client.post(`${receiptPath(household.id, receiptId)}/retry`);

  const discard = ({ client, household }: Member, receiptId: string) =>
    client.delete(receiptPath(household.id, receiptId));

  async function usage({ household }: Member): Promise<number> {
    const rows = await db
      .select({ requests: aiUsage.requests })
      .from(aiUsage)
      .where(eq(aiUsage.organizationId, household.id));
    return rows.reduce((sum, row) => sum + row.requests, 0);
  }

  const setStatus = (receiptId: string, status: "confirmed") =>
    db
      .update(receipts)
      .set({ status, failureCode: null, extractionId: null })
      .where(eq(receipts.id, receiptId));

  describe("extraction", () => {
    it("answers at once and fills the draft in the background", async () => {
      const alice = await setup();
      reply(GROCERIES);

      const started = await startScan(alice);
      expect(started).toMatchObject({
        status: "processing",
        failureCode: null,
        merchant: null,
        totalCents: null,
        items: [],
        createdBy: { id: alice.id, name: "Alice" },
      });

      const receipt = await settled(alice, started.id);
      expect(receipt).toMatchObject({
        status: "ready",
        failureCode: null,
        merchant: "Biedronka",
        purchasedOn: "2026-11-02",
        currency: "PLN",
        totalCents: 1360,
        discountCents: 50,
        itemsTotalCents: 1410,
        differenceCents: 0,
      });
      expect(receipt.items.map(({ id: _id, ...item }) => item)).toEqual([
        {
          position: 0,
          name: "Milk",
          quantity: 1,
          unitPriceCents: 499,
          discountCents: 0,
          totalCents: 499,
          assignments: [],
        },
        {
          position: 1,
          name: "Bread",
          quantity: 2,
          unitPriceCents: 350,
          discountCents: 100,
          totalCents: 600,
          assignments: [],
        },
        {
          position: 2,
          name: "Apples",
          quantity: 0.452,
          unitPriceCents: 689,
          discountCents: 0,
          totalCents: 311,
          assignments: [],
        },
      ]);
      expect(await usage(alice)).toBe(1);
    });

    it("sends the file and nothing about the member", async () => {
      const alice = await setup();
      reply(GROCERIES);

      await scanned(alice, PNG);

      expect(fake.requests).toHaveLength(1);
      const [text, file] = fake.requests[0]?.input ?? [];
      expect(file).toMatchObject({ type: "image", mimeType: "image/jpeg" });
      expect(JSON.stringify(text)).not.toContain("Alice");
      expect(JSON.stringify(text)).not.toContain(alice.email);
      expect(JSON.stringify(text)).not.toContain(alice.household.id);
    });

    it("reports the difference when the items don't add up to the total", async () => {
      const alice = await setup();
      reply({ ...GROCERIES, total: 20 });

      const receipt = await scanned(alice);

      expect(receipt).toMatchObject({
        status: "ready",
        totalCents: 2000,
        itemsTotalCents: 1410,
        differenceCents: -640,
      });
    });

    it("reports no difference while the total is unknown", async () => {
      const alice = await setup();
      reply({ ...GROCERIES, total: null });

      expect(await scanned(alice)).toMatchObject({
        status: "ready",
        totalCents: null,
        differenceCents: null,
      });
    });

    it.each([
      ["output that fails the schema", { merchant: 5 }],
      ["an amount past the limit", { ...GROCERIES, total: 1e13 }],
    ])("fails on %s", async (_case, body) => {
      const alice = await setup();
      reply(body);

      expect(await scanned(alice)).toMatchObject({
        status: "failed",
        failureCode: "AI_INVALID_OUTPUT",
        merchant: null,
        items: [],
      });
    });

    it("fails a file that isn't a receipt", async () => {
      const alice = await setup();
      reply({ ...GROCERIES, isReceipt: false });

      expect(await scanned(alice)).toMatchObject({
        status: "failed",
        failureCode: "NOT_A_RECEIPT",
      });
    });

    it("fails with the AI error code", async () => {
      const alice = await setup();
      fake.on(SCAN_RECEIPT_TASK, () => {
        throw aiTimeout();
      });

      expect(await scanned(alice)).toMatchObject({
        status: "failed",
        failureCode: "AI_TIMEOUT",
      });
    });

    it("fails an image it can't decode without calling the model", async () => {
      const alice = await setup();
      reply(GROCERIES);

      expect(await scanned(alice, BROKEN_HEIC)).toMatchObject({
        status: "failed",
        failureCode: "UNSUPPORTED_FILE_TYPE",
      });
      expect(fake.requests).toHaveLength(0);
    });

    it("rejects an attachment that isn't the household's", async () => {
      const alice = await setup();

      const response = await scan(alice, randomUUID()).expect(400);

      expectApiError(response, "INVALID_REFERENCE");
      expect(response.body.details.issues).toEqual([
        { path: ["attachmentId"], message: "Unknown attachment" },
      ]);
    });

    it("needs ai turned on, and stores nothing without it", async () => {
      const alice = await setup({ ai: false });

      const response = await scan(alice, await upload(alice)).expect(403);

      expectApiError(response, "MODULE_DISABLED");
      expect(response.body.details).toEqual({ module: "ai" });
      expect(await db.select().from(receipts)).toHaveLength(0);
    });

    it("needs expenses turned on for writes, but still reads", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);
      await alice.client
        .patch(`/api/households/${alice.household.id}/features`)
        .send({ expenses: false })
        .expect(200);

      const response = await scan(alice, await upload(alice)).expect(403);
      expectApiError(response, "MODULE_DISABLED");
      expect(response.body.details).toEqual({ module: "expenses" });
      await update(alice, receipt.id, { merchant: "Lidl" }).expect(403);
      await discard(alice, receipt.id).expect(403);
      await get(alice, receipt.id);
    });
  });

  describe("retry", () => {
    it("reads a failed receipt again", async () => {
      const alice = await setup();
      reply({ merchant: 5 });
      const failed = await scanned(alice);
      reply(GROCERIES);

      const response = await retry(alice, failed.id).expect(200);

      expect(Receipt.parse(response.body)).toMatchObject({
        id: failed.id,
        status: "processing",
        failureCode: null,
      });
      expect(await settled(alice, failed.id)).toMatchObject({
        status: "ready",
        merchant: "Biedronka",
      });
      expect(await usage(alice)).toBe(2);
    });

    it("refuses a receipt that hasn't failed", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);

      const response = await retry(alice, receipt.id).expect(409);

      expectApiError(response, "RECEIPT_NOT_FAILED");
    });

    it("treats a receipt stuck processing as interrupted", async () => {
      const alice = await setup();
      const gate = gatedReply(GROCERIES);
      const { id } = await startScan(alice);
      await db
        .update(receipts)
        .set({ updatedAt: new Date(Date.now() - STALE_AFTER_MS - 60_000) })
        .where(eq(receipts.id, id));

      expect(await get(alice, id)).toMatchObject({
        status: "failed",
        failureCode: "EXTRACTION_INTERRUPTED",
      });
      await retry(alice, id).expect(200);
      gate.open();
      await extraction.idle();

      // The overtaken run wrote nothing; the retry wrote the draft once.
      const receipt = await get(alice, id);
      expect(receipt).toMatchObject({ status: "ready", merchant: "Biedronka" });
      expect(receipt.items).toHaveLength(3);
    });
  });

  describe("editing", () => {
    it("edits the header, and changes, adds, removes, and reorders items", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);
      const [milk, bread, apples] = receipt.items;
      if (!(milk && bread && apples)) {
        throw new Error("Expected three items");
      }

      const response = await update(alice, receipt.id, {
        merchant: "Biedronka Kraków",
        purchasedOn: null,
        totalCents: 1500,
        discountCents: 0,
        items: [
          { ...asInput(apples), quantity: 0.5, totalCents: 345 },
          {
            name: "Eggs",
            quantity: 1,
            unitPriceCents: 1000,
            totalCents: 1000,
          },
          asInput(bread),
        ],
      }).expect(200);

      const updated = Receipt.parse(response.body);
      expect(updated).toMatchObject({
        status: "ready",
        merchant: "Biedronka Kraków",
        purchasedOn: null,
        currency: "PLN",
        totalCents: 1500,
        discountCents: 0,
        itemsTotalCents: 1945,
        differenceCents: 445,
      });
      expect(updated.items).toEqual([
        { ...apples, position: 0, quantity: 0.5, totalCents: 345 },
        {
          id: expect.any(String),
          position: 1,
          name: "Eggs",
          quantity: 1,
          unitPriceCents: 1000,
          discountCents: 0,
          totalCents: 1000,
          assignments: [],
        },
        { ...bread, position: 2 },
      ]);
      expect(updated.items.map(({ id }) => id)).not.toContain(milk.id);
      expect(await get(alice, receipt.id)).toEqual(updated);
    });

    it("leaves the items alone when the patch has none", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);

      const response = await update(alice, receipt.id, {
        currency: "EUR",
      }).expect(200);

      expect(Receipt.parse(response.body).items).toEqual(receipt.items);
    });

    it("lets a member fill in a failed receipt by hand", async () => {
      const alice = await setup();
      reply({ merchant: 5 });
      const failed = await scanned(alice);

      const response = await update(alice, failed.id, {
        merchant: "Corner shop",
        currency: "PLN",
        totalCents: 250,
        items: [
          { name: "Coffee", quantity: 1, unitPriceCents: 250, totalCents: 250 },
        ],
      }).expect(200);

      expect(Receipt.parse(response.body)).toMatchObject({
        status: "ready",
        failureCode: null,
        merchant: "Corner shop",
        differenceCents: 0,
      });
    });

    it.each([
      ["an empty patch", {}, "EMPTY_PATCH"],
      ["a blank merchant", { merchant: " " }, "VALIDATION_ERROR"],
      ["an unknown currency", { currency: "XAU" }, "VALIDATION_ERROR"],
      ["a negative total", { totalCents: -1 }, "VALIDATION_ERROR"],
      [
        "a quantity with four decimals",
        {
          items: [
            {
              name: "Ham",
              quantity: 0.1234,
              unitPriceCents: 1,
              totalCents: 1,
            },
          ],
        },
        "VALIDATION_ERROR",
      ],
    ])("rejects %s", async (_case, body, code) => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);

      expectApiError(await update(alice, receipt.id, body).expect(400), code);
    });

    it("rejects an item ID given twice", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);
      const [milk] = receipt.items;
      const item = {
        id: milk?.id,
        name: "Milk",
        quantity: 1,
        unitPriceCents: 499,
        totalCents: 499,
      };

      const response = await update(alice, receipt.id, {
        items: [item, item],
      }).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        { path: ["items", 1, "id"], message: "Duplicate item id" },
      ]);
    });

    it("rejects an item of another receipt", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const first = await scanned(alice);
      const second = await scanned(alice);
      const [foreign] = second.items;

      const response = await update(alice, first.id, {
        items: [
          {
            id: foreign?.id,
            name: "Milk",
            quantity: 1,
            unitPriceCents: 499,
            totalCents: 499,
          },
        ],
      }).expect(400);

      expectApiError(response, "INVALID_REFERENCE");
      expect(response.body.details.issues).toEqual([
        { path: ["items", 0, "id"], message: "Unknown item" },
      ]);
      expect((await get(alice, second.id)).items).toEqual(second.items);
    });

    it("keeps a receipt read-only while it's being read", async () => {
      const alice = await setup();
      const gate = gatedReply(GROCERIES);
      const { id } = await startScan(alice);

      expectApiError(
        await update(alice, id, { merchant: "Lidl" }).expect(409),
        "RECEIPT_PROCESSING"
      );
      expectApiError(await retry(alice, id).expect(409), "RECEIPT_NOT_FAILED");

      gate.open();
      expect(await settled(alice, id)).toMatchObject({
        status: "ready",
        merchant: "Biedronka",
      });
    });

    it("keeps a confirmed receipt read-only", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);
      await setStatus(receipt.id, "confirmed");

      expectApiError(
        await update(alice, receipt.id, { merchant: "Lidl" }).expect(409),
        "RECEIPT_CONFIRMED"
      );
      expectApiError(
        await discard(alice, receipt.id).expect(409),
        "RECEIPT_CONFIRMED"
      );
      expectApiError(
        await retry(alice, receipt.id).expect(409),
        "RECEIPT_NOT_FAILED"
      );
      expect(await get(alice, receipt.id)).toMatchObject({
        status: "confirmed",
        merchant: "Biedronka",
        items: receipt.items,
      });
    });
  });

  describe("discarding", () => {
    it("deletes the receipt and its items", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);

      await discard(alice, receipt.id).expect(204);

      await alice.client
        .get(receiptPath(alice.household.id, receipt.id))
        .expect(404);
      expect(await db.select().from(receiptItems)).toHaveLength(0);
    });

    it("discards a receipt while it's being read, and the run writes nothing", async () => {
      const alice = await setup();
      const gate = gatedReply(GROCERIES);
      const { id } = await startScan(alice);

      await discard(alice, id).expect(204);
      gate.open();
      await extraction.idle();

      expect(await db.select().from(receipts)).toHaveLength(0);
      expect(await db.select().from(receiptItems)).toHaveLength(0);
    });

    it("keeps the scanned file until the receipt is discarded", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const receipt = await scanned(alice);
      const cleanup = app.get(AttachmentsCleanupService);
      const later = () => new Date(Date.now() + 25 * HOUR_MS);

      expect(await cleanup.run(later())).toMatchObject({
        deletedAttachments: 0,
      });

      await discard(alice, receipt.id).expect(204);
      expect(await cleanup.run(later())).toMatchObject({
        deletedAttachments: 1,
      });
    });
  });

  describe("listing", () => {
    it("lists the household's receipts newest first, without items", async () => {
      const alice = await setup();
      reply(GROCERIES);
      const older = await scanned(alice);
      const newer = await scanned(alice);

      const response = await alice.client
        .get(`${receiptsPath(alice.household.id)}?pageSize=1`)
        .expect(200);

      const list = ReceiptListResponse.parse(response.body);
      expect(list).toMatchObject({ page: 1, pageSize: 1, totalItems: 2 });
      expect(list.items.map(({ id }) => id)).toEqual([newer.id]);
      expect(response.body.items[0]).not.toHaveProperty("items");

      const second = await alice.client
        .get(`${receiptsPath(alice.household.id)}?page=2&pageSize=1`)
        .expect(200);
      expect(
        ReceiptListResponse.parse(second.body).items.map(({ id }) => id)
      ).toEqual([older.id]);
    });
  });

  describe("access from another household", () => {
    it("hides a receipt from members of other households", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await optIn(alice);
      await optIn(bob);
      reply(GROCERIES);
      const receipt = await scanned(alice);
      const [item] = receipt.items;

      // In Bob's own household, Alice's receipt doesn't exist.
      const bobs = receiptPath(bob.household.id, receipt.id);
      await bob.client.get(bobs).expect(404);
      await bob.client.patch(bobs).send({ merchant: "Lidl" }).expect(404);
      await bob.client.post(`${bobs}/retry`).expect(404);
      await bob.client.delete(bobs).expect(404);

      // In Alice's household, Bob isn't a member.
      const alices = receiptPath(alice.household.id, receipt.id);
      await bob.client.get(alices).expect(404);
      await bob.client.patch(alices).send({ merchant: "Lidl" }).expect(404);
      await bob.client.delete(alices).expect(404);
      await bob.client.get(receiptsPath(alice.household.id)).expect(404);

      const list = await bob.client
        .get(receiptsPath(bob.household.id))
        .expect(200);
      expect(ReceiptListResponse.parse(list.body).totalItems).toBe(0);

      // Nor can Bob scan Alice's file, or move her items into his receipt.
      expectApiError(
        await scan(bob, receipt.attachmentId).expect(400),
        "INVALID_REFERENCE"
      );
      const bobsReceipt = await scanned(bob);
      expectApiError(
        await update(bob, bobsReceipt.id, {
          items: [
            {
              id: item?.id,
              name: "Milk",
              quantity: 1,
              unitPriceCents: 499,
              totalCents: 499,
            },
          ],
        }).expect(400),
        "INVALID_REFERENCE"
      );

      expect(await get(alice, receipt.id)).toEqual(receipt);
    });
  });
});
