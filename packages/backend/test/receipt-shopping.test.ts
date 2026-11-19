import { setTimeout as sleep } from "node:timers/promises";
import {
  ATTACHMENT_UPLOAD_FIELD,
  ConfirmReceiptResponse,
  PurchaseReceiptShoppingItemsResponse,
  Receipt,
  ReceiptShoppingMatchesResponse,
  ShoppingItem,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiClient } from "@/ai/ai-client";
import { FakeAiClient } from "@/ai/fake-ai-client";
import {
  type ModelReceipt,
  SCAN_RECEIPT_TASK,
} from "@/features/receipts/receipt-draft";
import { MATCH_SHOPPING_TASK } from "@/features/receipts/receipt-shopping.service";
import { expectApiError } from "./helpers/api";
import { createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");

const GROCERIES: ModelReceipt = {
  isReceipt: true,
  merchant: "Biedronka",
  purchasedOn: "2026-11-07",
  currency: "PLN",
  total: 15.47,
  receiptDiscount: null,
  items: [
    {
      name: "Mleko 2% 1L",
      quantity: 2,
      unitPrice: 3.49,
      discount: null,
      total: 6.98,
    },
    { name: "Bread", quantity: 1, unitPrice: 4.5, discount: null, total: 4.5 },
    {
      name: "Baterie AA",
      quantity: 1,
      unitPrice: 3.99,
      discount: null,
      total: 3.99,
    },
  ],
};

type Member = { household: TestHousehold } & TestUser;

describe("receipts and the shopping list", () => {
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

  const householdPath = ({ household }: Member) =>
    `/api/households/${household.id}`;
  const receiptPath = (member: Member, receiptId: string) =>
    `${householdPath(member)}/receipts/${receiptId}`;

  const setFeatures = (member: Member, features: object) =>
    member.client
      .patch(`${householdPath(member)}/features`)
      .send(features)
      .expect(200);

  /** Alice owns the household with `ai` on, and Bob is a member. */
  async function flat(): Promise<{ alice: Member; bob: Member }> {
    const alice = await createUser(app, "Alice");
    const bob = await createUser(app, "Bob");
    const household = await createHousehold(alice);
    await inviteAndAccept(alice, household, bob);
    const members = {
      alice: { ...alice, household },
      bob: { ...bob, household },
    };
    await setFeatures(members.alice, { ai: true });
    return members;
  }

  async function addItem(member: Member, name: string): Promise<ShoppingItem> {
    const response = await member.client
      .post(`${householdPath(member)}/shopping-items`)
      .send({ name })
      .expect(201);
    return ShoppingItem.parse(response.body);
  }

  async function get(member: Member, receiptId: string): Promise<Receipt> {
    const response = await member.client
      .get(receiptPath(member, receiptId))
      .expect(200);
    return Receipt.parse(response.body);
  }

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

  /** Scans the receipt and leaves it `ready`. */
  async function scan(member: Member): Promise<Receipt> {
    fake.on(SCAN_RECEIPT_TASK, () => GROCERIES);
    const upload = await member.client
      .post(`${householdPath(member)}/attachments`)
      .attach(ATTACHMENT_UPLOAD_FIELD, PDF, "file")
      .expect(201);
    const response = await member.client
      .post(`${householdPath(member)}/receipts`)
      .send({ attachmentId: upload.body.id })
      .expect(201);
    return settled(member, Receipt.parse(response.body).id);
  }

  /** Scans, assigns everything to the scanner, and confirms with `payer` paying. */
  async function confirmedReceipt(
    member: Member,
    payer: TestUser = member
  ): Promise<Receipt> {
    const receipt = await scan(member);
    await member.client
      .put(`${receiptPath(member, receipt.id)}/assignments`)
      .send({
        items: receipt.items.map(({ id }) => ({
          itemId: id,
          assignees: [{ userId: member.id, shares: 1 }],
        })),
      })
      .expect(200);
    const response = await member.client
      .post(`${receiptPath(member, receipt.id)}/confirm`)
      .send({ categoryId: null, payerId: payer.id })
      .expect(200);
    return ConfirmReceiptResponse.parse(response.body).receipt;
  }

  const suggest = (member: Member, receiptId: string) =>
    member.client.post(`${receiptPath(member, receiptId)}/shopping-matches`);

  async function matches(member: Member, receiptId: string) {
    const response = await suggest(member, receiptId).expect(200);
    return ReceiptShoppingMatchesResponse.parse(response.body).matches;
  }

  const purchase = (member: Member, receiptId: string, itemIds: string[]) =>
    member.client
      .post(`${receiptPath(member, receiptId)}/purchase-shopping-items`)
      .send({ itemIds });

  async function purchased(
    member: Member,
    receiptId: string,
    itemIds: string[]
  ) {
    const response = await purchase(member, receiptId, itemIds).expect(200);
    return PurchaseReceiptShoppingItemsResponse.parse(response.body);
  }

  const reply = (body: unknown) => fake.on(MATCH_SHOPPING_TASK, () => body);

  /** The JSON prompt the matching request sent. */
  function prompt(): {
    receipt: { name: string; number: number }[];
    shoppingList: { name: string; number: number }[];
  } {
    const request = fake.requests.find(
      ({ task }) => task === MATCH_SHOPPING_TASK
    );
    const [text] = request?.input ?? [];
    if (text?.type !== "text") {
      throw new Error("Expected a text prompt");
    }
    return JSON.parse(text.text);
  }

  describe("suggestions", () => {
    it("matches exact and fuzzy names to the shopping list", async () => {
      const { alice } = await flat();
      const milk = await addItem(alice, "milk");
      const bread = await addItem(alice, "Bread");
      await addItem(alice, "Coffee");
      const receipt = await confirmedReceipt(alice);
      const [mleko, receiptBread] = receipt.items;
      // Numbered as the prompt lists them: the list in its order, from 1.
      reply({
        matches: [
          { shoppingItem: 2, receiptItem: 2, confidence: "high" },
          { shoppingItem: 1, receiptItem: 1, confidence: "medium" },
        ],
      });

      const found = await matches(alice, receipt.id);

      expect(
        found.map(({ shoppingItem, receiptItemId, confidence }) => [
          shoppingItem.id,
          receiptItemId,
          confidence,
        ])
      ).toEqual([
        [milk.id, mleko?.id, "medium"],
        [bread.id, receiptBread?.id, "high"],
      ]);
      expect(found[0]?.shoppingItem).toEqual(milk);

      const sent = prompt();
      expect(sent.receipt.map(({ name }) => name)).toEqual([
        "Mleko 2% 1L",
        "Bread",
        "Baterie AA",
      ]);
      expect(sent.shoppingList.map(({ name }) => name)).toEqual([
        "milk",
        "Bread",
        "Coffee",
      ]);
      const text = JSON.stringify(sent);
      expect(text).not.toContain(milk.id);
      expect(text).not.toContain(alice.id);
      expect(text).not.toContain("Alice");
    });

    it("answers no matches when the model finds none", async () => {
      const { alice } = await flat();
      await addItem(alice, "Coffee");
      const receipt = await confirmedReceipt(alice);
      reply({ matches: [] });

      expect(await matches(alice, receipt.id)).toEqual([]);
    });

    it("doesn't call the model without unpurchased items", async () => {
      const { alice } = await flat();
      const receipt = await confirmedReceipt(alice);
      const milk = await addItem(alice, "milk");
      await alice.client
        .post(`${householdPath(alice)}/shopping-items/${milk.id}/purchase`)
        .expect(200);

      expect(await matches(alice, receipt.id)).toEqual([]);
      expect(
        fake.requests.filter(({ task }) => task === MATCH_SHOPPING_TASK)
      ).toHaveLength(0);
    });

    it("discards unknown positions and a second match for the same item", async () => {
      const { alice } = await flat();
      const milk = await addItem(alice, "milk");
      const receipt = await confirmedReceipt(alice);
      reply({
        matches: [
          { shoppingItem: 2, receiptItem: 1, confidence: "high" },
          { shoppingItem: 1, receiptItem: 9, confidence: "high" },
          { shoppingItem: 0, receiptItem: 1, confidence: "high" },
          { shoppingItem: 1.5, receiptItem: 1, confidence: "high" },
          { shoppingItem: 1, receiptItem: 1, confidence: "low" },
          { shoppingItem: 1, receiptItem: 2, confidence: "high" },
        ],
      });

      const found = await matches(alice, receipt.id);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        shoppingItem: { id: milk.id },
        receiptItemId: receipt.items[0]?.id,
        confidence: "low",
      });
    });

    it("only offers the household's own unpurchased items", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await setFeatures(alice, { ai: true });
      await addItem(bob, "Bob's milk");
      const bought = await addItem(alice, "Already bought");
      await alice.client
        .post(`${householdPath(alice)}/shopping-items/${bought.id}/purchase`)
        .expect(200);
      const milk = await addItem(alice, "milk");
      const receipt = await confirmedReceipt(alice);
      reply({
        matches: [{ shoppingItem: 1, receiptItem: 1, confidence: "high" }],
      });

      const found = await matches(alice, receipt.id);

      expect(prompt().shoppingList.map(({ name }) => name)).toEqual(["milk"]);
      expect(found.map(({ shoppingItem }) => shoppingItem.id)).toEqual([
        milk.id,
      ]);
    });

    it("needs ai and shopping turned on, and a confirmed receipt", async () => {
      const { alice } = await flat();
      await addItem(alice, "milk");
      const draft = await scan(alice);
      expectApiError(
        await suggest(alice, draft.id).expect(409),
        "RECEIPT_NOT_CONFIRMED"
      );

      const receipt = await confirmedReceipt(alice);
      await setFeatures(alice, { ai: false });
      const noAi = await suggest(alice, receipt.id).expect(403);
      expectApiError(noAi, "MODULE_DISABLED");
      expect(noAi.body.details).toEqual({ module: "ai" });

      await setFeatures(alice, { ai: true, shopping: false });
      const noShopping = await suggest(alice, receipt.id).expect(403);
      expectApiError(noShopping, "MODULE_DISABLED");
      expect(noShopping.body.details).toEqual({ module: "shopping" });
    });
  });

  describe("purchasing", () => {
    it("marks the items purchased by the payer at the confirmation time", async () => {
      const { alice, bob } = await flat();
      const milk = await addItem(alice, "milk");
      const bread = await addItem(alice, "Bread");
      const receipt = await confirmedReceipt(alice, bob);
      expect(receipt).toMatchObject({ payer: { id: bob.id } });

      const result = await purchased(alice, receipt.id, [bread.id, milk.id]);

      expect(result.skipped).toEqual([]);
      expect(result.purchased.map(({ id }) => id)).toEqual([bread.id, milk.id]);
      for (const item of result.purchased) {
        expect(item).toMatchObject({
          isPurchased: true,
          purchasedBy: { id: bob.id },
          purchasedAt: receipt.confirmedAt,
        });
      }
    });

    it("works with ai off, for items picked by hand", async () => {
      const { alice } = await flat();
      const coffee = await addItem(alice, "Coffee");
      const receipt = await confirmedReceipt(alice);
      await setFeatures(alice, { ai: false });

      const result = await purchased(alice, receipt.id, [coffee.id]);

      expect(result.purchased.map(({ id }) => id)).toEqual([coffee.id]);
    });

    it("skips items purchased, deleted, or not the household's, and says so", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await setFeatures(alice, { ai: true });
      const milk = await addItem(alice, "milk");
      const bought = await addItem(alice, "Bread");
      const gone = await addItem(alice, "Eggs");
      const theirs = await addItem(bob, "Bob's milk");
      const receipt = await confirmedReceipt(alice);
      await alice.client
        .post(`${householdPath(alice)}/shopping-items/${bought.id}/purchase`)
        .expect(200);
      await alice.client
        .delete(`${householdPath(alice)}/shopping-items/${gone.id}`)
        .expect(204);

      const result = await purchased(alice, receipt.id, [
        milk.id,
        bought.id,
        gone.id,
        theirs.id,
      ]);

      expect(result.purchased.map(({ id }) => id)).toEqual([milk.id]);
      expect(result.skipped).toEqual([
        { itemId: bought.id, reason: "ALREADY_PURCHASED" },
        { itemId: gone.id, reason: "NOT_FOUND" },
        { itemId: theirs.id, reason: "NOT_FOUND" },
      ]);
      const bobs = await bob.client
        .get(`${householdPath(bob)}/shopping-items/${theirs.id}`)
        .expect(200);
      expect(ShoppingItem.parse(bobs.body).isPurchased).toBe(false);
    });

    it("purchases each item once when two requests race", async () => {
      const { alice, bob } = await flat();
      const items = await Promise.all(
        ["milk", "Bread", "Eggs", "Coffee"].map((name) => addItem(alice, name))
      );
      const ids = items.map(({ id }) => id);
      const receipt = await confirmedReceipt(alice);

      const [first, second] = await Promise.all([
        purchased(alice, receipt.id, ids),
        purchased(bob, receipt.id, [...ids].reverse()),
      ]);

      const winners = [...first.purchased, ...second.purchased].map(
        ({ id }) => id
      );
      expect([...winners].sort()).toEqual([...ids].sort());
      expect(
        [...first.skipped, ...second.skipped].every(
          ({ reason }) => reason === "ALREADY_PURCHASED"
        )
      ).toBe(true);
      expect(first.skipped.length + second.skipped.length).toBe(ids.length);
    });

    it("validates the request, and needs shopping on and a confirmed receipt", async () => {
      const { alice } = await flat();
      const milk = await addItem(alice, "milk");
      const draft = await scan(alice);
      expectApiError(
        await purchase(alice, draft.id, [milk.id]).expect(409),
        "RECEIPT_NOT_CONFIRMED"
      );

      const receipt = await confirmedReceipt(alice);
      expectApiError(
        await purchase(alice, receipt.id, []).expect(400),
        "VALIDATION_ERROR"
      );
      expectApiError(
        await purchase(alice, receipt.id, [milk.id, milk.id]).expect(400),
        "VALIDATION_ERROR"
      );

      await setFeatures(alice, { shopping: false });
      const response = await purchase(alice, receipt.id, [milk.id]).expect(403);
      expectApiError(response, "MODULE_DISABLED");
      expect(response.body.details).toEqual({ module: "shopping" });
    });

    it("hides another household's receipt", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await setFeatures(alice, { ai: true });
      const milk = await addItem(bob, "milk");
      const receipt = await confirmedReceipt(alice);

      await purchase(bob, receipt.id, [milk.id]).expect(404);
      await suggest(bob, receipt.id).expect(404);
    });
  });
});
