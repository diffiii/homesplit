import { ShoppingItem, ShoppingItemListResponse } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { shoppingItems } from "@/db/schema";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const itemsPath = (householdId: string) =>
  `/api/households/${householdId}/shopping-items`;

const itemPath = (householdId: string, itemId: string) =>
  `${itemsPath(householdId)}/${itemId}`;

const summary = ({ id, name }: TestUser) => ({ id, name, imageUrl: null });

const markPurchased = (itemId: string, buyer: TestUser) =>
  db
    .update(shoppingItems)
    .set({ purchasedById: buyer.id, purchasedAt: new Date() })
    .where(eq(shoppingItems.id, itemId));

describe("shopping items", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function setup() {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    await inviteAndAccept(alice, alice.household, carol);
    return { alice, bob, carol };
  }

  async function addItem(
    author: TestUser,
    household: TestHousehold,
    body: object
  ): Promise<ShoppingItem> {
    const response = await author.client
      .post(itemsPath(household.id))
      .send(body)
      .expect(201);
    return ShoppingItem.parse(response.body);
  }

  async function listItems(
    viewer: TestUser,
    household: TestHousehold,
    query = ""
  ): Promise<ShoppingItemListResponse> {
    const response = await viewer.client
      .get(`${itemsPath(household.id)}${query}`)
      .expect(200);
    return ShoppingItemListResponse.parse(response.body);
  }

  describe("POST", () => {
    it("adds an unpurchased item by the caller", async () => {
      const { alice, carol } = await setup();

      const item = await addItem(carol, alice.household, {
        name: "Milk",
        quantity: 2,
        unit: "l",
      });

      expect(item).toEqual({
        id: item.id,
        householdId: alice.household.id,
        name: "Milk",
        quantity: 2,
        unit: "l",
        addedBy: summary(carol),
        addedAt: item.addedAt,
        isPurchased: false,
        purchasedBy: null,
        purchasedAt: null,
      });
      expect(await db.select().from(shoppingItems)).toEqual([
        {
          id: item.id,
          householdId: alice.household.id,
          name: "Milk",
          quantity: 2,
          unit: "l",
          addedById: carol.id,
          addedAt: new Date(item.addedAt),
          purchasedById: null,
          purchasedAt: null,
        },
      ]);
    });

    it("defaults quantity to 1 and unit to null", async () => {
      const { alice } = await setup();

      const item = await addItem(alice, alice.household, { name: "Bread" });

      expect(item).toMatchObject({ quantity: 1, unit: null });
    });

    it("trims the name and unit", async () => {
      const { alice } = await setup();

      const item = await addItem(alice, alice.household, {
        name: "  Eggs ",
        unit: " pack ",
      });

      expect(item).toMatchObject({ name: "Eggs", unit: "pack" });
    });

    it("ignores server-set and purchase fields", async () => {
      const { alice, carol } = await setup();

      const item = await addItem(carol, alice.household, {
        name: "Rice",
        addedBy: summary(alice),
        isPurchased: true,
        purchasedBy: summary(alice),
        purchasedAt: new Date().toISOString(),
      });

      expect(item).toMatchObject({
        addedBy: summary(carol),
        isPurchased: false,
        purchasedBy: null,
        purchasedAt: null,
      });
    });

    it.each([
      ["a blank name", { name: "   " }],
      ["a missing name", {}],
      ["a blank unit", { name: "Tea", unit: "  " }],
      ["a zero quantity", { name: "Tea", quantity: 0 }],
      ["a fractional quantity", { name: "Tea", quantity: 1.5 }],
      [
        "a quantity past the integer column",
        { name: "Tea", quantity: 2 ** 31 },
      ],
    ])("rejects %s", async (_label, body) => {
      const { alice } = await setup();

      const response = await alice.client
        .post(itemsPath(alice.household.id))
        .send(body)
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(await db.select().from(shoppingItems)).toEqual([]);
    });
  });

  describe("GET one", () => {
    it("returns the item, purchased or not", async () => {
      const { alice, carol } = await setup();
      const item = await addItem(alice, alice.household, { name: "Salt" });
      await markPurchased(item.id, carol);

      const response = await carol.client
        .get(itemPath(alice.household.id, item.id))
        .expect(200);

      expect(ShoppingItem.parse(response.body)).toMatchObject({
        id: item.id,
        isPurchased: true,
        purchasedBy: summary(carol),
      });
    });
  });

  describe("PATCH", () => {
    it("lets any member change some fields and keeps the rest", async () => {
      const { alice, carol } = await setup();
      const item = await addItem(alice, alice.household, {
        name: "Apples",
        quantity: 3,
        unit: "kg",
      });

      const response = await carol.client
        .patch(itemPath(alice.household.id, item.id))
        .send({ quantity: 5, unit: null })
        .expect(200);

      expect(ShoppingItem.parse(response.body)).toEqual({
        ...item,
        quantity: 5,
        unit: null,
      });
    });

    it("ignores purchase fields next to writable ones", async () => {
      const { alice } = await setup();
      const item = await addItem(alice, alice.household, { name: "Pasta" });

      const response = await alice.client
        .patch(itemPath(alice.household.id, item.id))
        .send({ name: " Penne ", isPurchased: true })
        .expect(200);

      expect(ShoppingItem.parse(response.body)).toEqual({
        ...item,
        name: "Penne",
      });
    });

    it("answers EMPTY_PATCH when only purchase fields are sent", async () => {
      const { alice } = await setup();
      const item = await addItem(alice, alice.household, { name: "Pasta" });

      const response = await alice.client
        .patch(itemPath(alice.household.id, item.id))
        .send({ isPurchased: true, purchasedAt: new Date().toISOString() })
        .expect(400);

      expectApiError(response, "EMPTY_PATCH");
    });

    it("rejects a null name", async () => {
      const { alice } = await setup();
      const item = await addItem(alice, alice.household, { name: "Pasta" });

      const response = await alice.client
        .patch(itemPath(alice.household.id, item.id))
        .send({ name: null })
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });
  });

  describe("DELETE", () => {
    it("removes the item, and a repeat answers 404", async () => {
      const { alice, carol } = await setup();
      const item = await addItem(alice, alice.household, { name: "Soap" });
      const path = itemPath(alice.household.id, item.id);

      await carol.client.delete(path).expect(204);
      const repeated = await carol.client.delete(path).expect(404);

      expectApiError(repeated, "NOT_FOUND");
      expect(await db.select().from(shoppingItems)).toEqual([]);
    });
  });

  describe("GET list", () => {
    it("hides purchased items unless asked, which come last", async () => {
      const { alice } = await setup();
      const first = await addItem(alice, alice.household, { name: "A" });
      const second = await addItem(alice, alice.household, { name: "B" });
      const third = await addItem(alice, alice.household, { name: "C" });
      await markPurchased(first.id, alice);

      const unpurchased = await listItems(alice, alice.household);
      const all = await listItems(
        alice,
        alice.household,
        "?includePurchased=true"
      );

      expect(unpurchased.items.map((item) => item.id)).toEqual([
        second.id,
        third.id,
      ]);
      expect(unpurchased.totalItems).toBe(2);
      expect(all.items.map((item) => item.id)).toEqual([
        second.id,
        third.id,
        first.id,
      ]);
      expect(all.totalItems).toBe(3);
    });

    it("paginates with the real total", async () => {
      const { alice } = await setup();
      await addItem(alice, alice.household, { name: "A" });
      await addItem(alice, alice.household, { name: "B" });
      const last = await addItem(alice, alice.household, { name: "C" });

      const page = await listItems(
        alice,
        alice.household,
        "?pageSize=2&page=2"
      );
      const pastEnd = await listItems(
        alice,
        alice.household,
        "?pageSize=2&page=3"
      );

      expect(page).toEqual({
        items: [last],
        page: 2,
        pageSize: 2,
        totalItems: 3,
      });
      expect(pastEnd).toMatchObject({ items: [], totalItems: 3 });
    });

    it("rejects an unrecognized includePurchased", async () => {
      const { alice } = await setup();

      const response = await alice.client
        .get(`${itemsPath(alice.household.id)}?includePurchased=yes`)
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });

    it("lists only this household's items", async () => {
      const { alice, bob } = await setup();
      const mine = await addItem(alice, alice.household, { name: "Mine" });
      await addItem(bob, bob.household, { name: "Theirs" });

      expect((await listItems(alice, alice.household)).items).toEqual([mine]);
    });
  });

  describe("access", () => {
    it("answers 404 for another household's item", async () => {
      const { alice, bob } = await setup();
      const theirs = await addItem(bob, bob.household, { name: "Theirs" });
      const path = itemPath(alice.household.id, theirs.id);

      const responses = [
        await alice.client.get(path).expect(404),
        await alice.client.patch(path).send({ name: "Mine" }).expect(404),
        await alice.client.delete(path).expect(404),
      ];

      for (const response of responses) {
        expectApiError(response, "NOT_FOUND");
      }
      expect(await db.select().from(shoppingItems)).toEqual([
        expect.objectContaining({ id: theirs.id, name: "Theirs" }),
      ]);
    });

    it("hides the household from non-members and requires a session", async () => {
      const { alice, bob } = await setup();
      const item = await addItem(alice, alice.household, { name: "Milk" });

      await bob.client.get(itemsPath(alice.household.id)).expect(404);
      await bob.client.get(itemPath(alice.household.id, item.id)).expect(404);
      await bob.client
        .post(itemsPath(alice.household.id))
        .send({ name: "Mine" })
        .expect(404);
      await createClient(app).get(itemsPath(alice.household.id)).expect(401);
    });
  });

  describe("with the shopping module off", () => {
    it("keeps items readable and rejects writes", async () => {
      const { alice } = await setup();
      const item = await addItem(alice, alice.household, { name: "Milk" });
      const path = itemPath(alice.household.id, item.id);
      await alice.client
        .patch(`/api/households/${alice.household.id}/features`)
        .send({ shopping: false })
        .expect(200);

      const responses = [
        await alice.client
          .post(itemsPath(alice.household.id))
          .send({ name: "Bread" })
          .expect(403),
        await alice.client.patch(path).send({ name: "Oat milk" }).expect(403),
        await alice.client.delete(path).expect(403),
      ];

      for (const response of responses) {
        expectApiError(response, "MODULE_DISABLED");
        expect(response.body.details).toEqual({ module: "shopping" });
      }
      await alice.client.get(path).expect(200);
      expect((await listItems(alice, alice.household)).items).toEqual([item]);
    });
  });

  describe("database constraints", () => {
    it("require a complete purchase and an author from the household", async () => {
      const { alice, bob } = await setup();
      const item = await addItem(alice, alice.household, { name: "Milk" });

      await expect(
        db
          .update(shoppingItems)
          .set({ name: " \t " })
          .where(eq(shoppingItems.id, item.id))
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        db
          .update(shoppingItems)
          .set({ unit: "   " })
          .where(eq(shoppingItems.id, item.id))
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        db
          .update(shoppingItems)
          .set({ purchasedAt: new Date() })
          .where(eq(shoppingItems.id, item.id))
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        db.insert(shoppingItems).values({
          householdId: alice.household.id,
          name: "Intruder",
          quantity: 1,
          addedById: bob.id,
        })
      ).rejects.toMatchObject({ cause: { code: "23503" } });
    });
  });
});
