import { randomUUID } from "node:crypto";
import {
  ExpenseCategory,
  ExpenseCategoryListResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { assertCategoryInHousehold } from "@/features/expense-categories/category-reference";
import { DEFAULT_CATEGORIES } from "@/features/expense-categories/default-categories";
import type { HouseholdRole } from "@/features/households/access/roles";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const categoriesPath = (householdId: string) =>
  `/api/households/${householdId}/expense-categories`;

const categoryPath = (householdId: string, categoryId: string) =>
  `${categoriesPath(householdId)}/${categoryId}`;

const storedCategories = (householdId: string) =>
  db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.householdId, householdId));

describe("expense categories", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Alice's and Bob's households, plus Carol as a member of Alice's. */
  async function setup(carolRole: HouseholdRole = "member") {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    await inviteAndAccept(alice, alice.household, carol, carolRole);
    return { alice, bob, carol };
  }

  async function createCategory(
    user: TestUser,
    household: TestHousehold,
    body: { name: string; icon?: string | null }
  ): Promise<ExpenseCategory> {
    const response = await user.client
      .post(categoriesPath(household.id))
      .send(body)
      .expect(201);
    return ExpenseCategory.parse(response.body);
  }

  async function listCategories(
    user: TestUser,
    household: TestHousehold
  ): Promise<ExpenseCategory[]> {
    const response = await user.client
      .get(categoriesPath(household.id))
      .expect(200);
    return ExpenseCategoryListResponse.parse(response.body).items;
  }

  describe("defaults", () => {
    it("gives a new household the default categories", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);

      const items = await listCategories(alice, household);

      expect(items.map(({ name, icon }) => ({ name, icon }))).toEqual(
        [...DEFAULT_CATEGORIES].sort((a, b) => a.name.localeCompare(b.name))
      );
      expect(items.every((item) => item.householdId === household.id)).toBe(
        true
      );
    });

    it("still creates the household when seeding fails", async () => {
      const alice = await createUser(app, "Alice");
      await db.execute(
        sql.raw(`
          CREATE FUNCTION "reject_category"() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'seeding failed';
          END;
          $$;
          CREATE TRIGGER "reject_category"
          BEFORE INSERT ON "expense_categories"
          FOR EACH ROW EXECUTE FUNCTION "reject_category"();
        `)
      );
      let household: TestHousehold;
      try {
        household = await createHousehold(alice);
      } finally {
        await db.execute(
          sql.raw(`
            DROP TRIGGER "reject_category" ON "expense_categories";
            DROP FUNCTION "reject_category"();
          `)
        );
      }

      expect(await listCategories(alice, household)).toEqual([]);
      await createCategory(alice, household, { name: "Groceries" });
    });
  });

  describe("GET", () => {
    it("orders by name ignoring case, then by id", async () => {
      const { alice } = await createTwoHouseholds(app);
      const householdId = alice.household.id;
      await db
        .delete(expenseCategories)
        .where(eq(expenseCategories.householdId, householdId));
      const first = "00000000-0000-4000-8000-000000000001";
      const last = "ffffffff-ffff-4fff-bfff-ffffffffffff";
      await db.insert(expenseCategories).values([
        { householdId, name: "cherry" },
        { householdId, name: "apple", id: last },
        { householdId, name: "Banana" },
        { householdId, name: "Apple", id: first },
      ]);

      const items = await listCategories(alice, alice.household);

      expect(items.map((item) => item.name)).toEqual([
        "Apple",
        "apple",
        "Banana",
        "cherry",
      ]);
    });

    it("lists only the household in the URL", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await createCategory(bob, bob.household, { name: "Bob's only" });

      const items = await listCategories(alice, alice.household);

      expect(items).toHaveLength(DEFAULT_CATEGORIES.length);
      expect(items.every((i) => i.householdId === alice.household.id)).toBe(
        true
      );
    });
  });

  describe("POST", () => {
    it("creates a category in the household from the URL", async () => {
      const { alice, bob } = await createTwoHouseholds(app);

      const response = await alice.client
        .post(categoriesPath(alice.household.id))
        .send({
          name: "Pets",
          icon: "🐶",
          id: randomUUID(),
          householdId: bob.household.id,
        })
        .expect(201);

      const created = ExpenseCategory.parse(response.body);
      expect(created).toEqual({
        id: expect.any(String),
        householdId: alice.household.id,
        name: "Pets",
        icon: "🐶",
      });
      expect(await listCategories(alice, alice.household)).toContainEqual(
        created
      );
      expect(await storedCategories(bob.household.id)).toHaveLength(
        DEFAULT_CATEGORIES.length
      );
    });

    it("stores no icon when none is sent", async () => {
      const { alice } = await createTwoHouseholds(app);

      const created = await createCategory(alice, alice.household, {
        name: "Pets",
      });

      expect(created.icon).toBeNull();
    });

    it.each([
      ["a missing name", { icon: "🐶" }, ["name"]],
      ["an empty name", { name: "" }, ["name"]],
      ["an icon that isn't an emoji", { name: "Pets", icon: "dog" }, ["icon"]],
      ["several emoji as the icon", { name: "Pets", icon: "🐶🐱" }, ["icon"]],
    ])("rejects %s", async (_, body, path) => {
      const { alice } = await createTwoHouseholds(app);

      const response = await alice.client
        .post(categoriesPath(alice.household.id))
        .send(body)
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        { path, message: expect.any(String) },
      ]);
    });
  });

  describe("PATCH", () => {
    it("changes only the fields it sends", async () => {
      const { alice } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
        icon: "🐶",
      });
      const path = categoryPath(alice.household.id, category.id);

      const renamed = await alice.client
        .patch(path)
        .send({ name: "Animals" })
        .expect(200);
      expect(ExpenseCategory.parse(renamed.body)).toEqual({
        ...category,
        name: "Animals",
      });

      const redrawn = await alice.client
        .patch(path)
        .send({ icon: "🐱" })
        .expect(200);
      expect(ExpenseCategory.parse(redrawn.body)).toEqual({
        ...category,
        name: "Animals",
        icon: "🐱",
      });
    });

    it("clears the icon with null", async () => {
      const { alice } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
        icon: "🐶",
      });

      const response = await alice.client
        .patch(categoryPath(alice.household.id, category.id))
        .send({ icon: null })
        .expect(200);

      expect(ExpenseCategory.parse(response.body)).toEqual({
        ...category,
        icon: null,
      });
      expect(await listCategories(alice, alice.household)).toContainEqual({
        ...category,
        icon: null,
      });
    });

    it.each([
      ["an empty body", {}, "EMPTY_PATCH"],
      ["unknown fields only", { householdId: randomUUID() }, "EMPTY_PATCH"],
      ["a null name", { name: null }, "VALIDATION_ERROR"],
      ["an empty icon", { icon: "" }, "VALIDATION_ERROR"],
    ])("rejects %s", async (_, body, code) => {
      const { alice } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
      });

      const response = await alice.client
        .patch(categoryPath(alice.household.id, category.id))
        .send(body)
        .expect(400);

      expectApiError(response, code);
    });
  });

  describe("DELETE", () => {
    it("removes the category", async () => {
      const { alice } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
      });
      const path = categoryPath(alice.household.id, category.id);

      const response = await alice.client.delete(path).expect(204);

      expect(response.body).toEqual({});
      expect(await listCategories(alice, alice.household)).not.toContainEqual(
        category
      );
      await alice.client.delete(path).expect(404);
    });
  });

  describe("household ownership", () => {
    it("hides another household's category behind the same 404 as a missing one", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      const bobs = await createCategory(bob, bob.household, { name: "Bob's" });
      const foreign = categoryPath(alice.household.id, bobs.id);
      const missing = categoryPath(alice.household.id, randomUUID());

      const patched = await alice.client
        .patch(foreign)
        .send({ name: "Mine now" })
        .expect(404);
      const patchedMissing = await alice.client
        .patch(missing)
        .send({ name: "Mine now" })
        .expect(404);
      const deleted = await alice.client.delete(foreign).expect(404);
      const deletedMissing = await alice.client.delete(missing).expect(404);

      expectApiError(patched, "NOT_FOUND");
      expect(patched.body).toEqual(patchedMissing.body);
      expect(deleted.body).toEqual(deletedMissing.body);
      expect(await listCategories(bob, bob.household)).toContainEqual(bobs);
    });

    it("rejects a malformed categoryId", async () => {
      const { alice } = await createTwoHouseholds(app);

      const response = await alice.client
        .delete(categoryPath(alice.household.id, "not-a-uuid"))
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        { path: ["categoryId"], message: expect.any(String) },
      ]);
    });

    it("deletes categories with their household", async () => {
      const { alice } = await createTwoHouseholds(app);
      const { id } = alice.household;
      expect(await storedCategories(id)).not.toEqual([]);

      await alice.client.delete(`/api/households/${id}`).expect(204);

      expect(await storedCategories(id)).toEqual([]);
    });
  });

  describe("roles and membership", () => {
    it("lets a member read but not write", async () => {
      const { alice, carol } = await setup("member");
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
      });
      const path = categoryPath(alice.household.id, category.id);

      expect(await listCategories(carol, alice.household)).toContainEqual(
        category
      );
      const responses = [
        await carol.client
          .post(categoriesPath(alice.household.id))
          .send({ name: "Carol's" })
          .expect(403),
        await carol.client.patch(path).send({ name: "Carol's" }).expect(403),
        await carol.client.delete(path).expect(403),
      ];

      for (const response of responses) {
        expectApiError(response, "FORBIDDEN");
      }
      expect(await listCategories(alice, alice.household)).toContainEqual(
        category
      );
    });

    it("lets an admin write", async () => {
      const { alice, carol } = await setup("admin");

      const category = await createCategory(carol, alice.household, {
        name: "Pets",
      });
      const path = categoryPath(alice.household.id, category.id);
      await carol.client.patch(path).send({ icon: "🐶" }).expect(200);
      await carol.client.delete(path).expect(204);
    });

    it("hides categories from non-members and unauthenticated callers", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
      });
      const list = categoriesPath(alice.household.id);
      const one = categoryPath(alice.household.id, category.id);

      await bob.client.get(list).expect(404);
      await bob.client.post(list).send({ name: "Bob's" }).expect(404);
      await bob.client.patch(one).send({ name: "Bob's" }).expect(404);
      await bob.client.delete(one).expect(404);

      const anonymous = createClient(app);
      await anonymous.get(list).expect(401);
      await anonymous.post(list).send({ name: "Nobody's" }).expect(401);
      await anonymous.patch(one).send({ name: "Nobody's" }).expect(401);
      await anonymous.delete(one).expect(401);

      expect(await listCategories(alice, alice.household)).toContainEqual(
        category
      );
    });
  });

  describe("with the expenses module off", () => {
    it("keeps categories readable and rejects writes", async () => {
      const { alice } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
      });
      const path = categoryPath(alice.household.id, category.id);
      await alice.client
        .patch(`/api/households/${alice.household.id}/features`)
        .send({ expenses: false })
        .expect(200);

      const responses = [
        await alice.client
          .post(categoriesPath(alice.household.id))
          .send({ name: "Travel" })
          .expect(403),
        await alice.client.patch(path).send({ name: "Animals" }).expect(403),
        await alice.client.delete(path).expect(403),
      ];

      for (const response of responses) {
        expectApiError(response, "MODULE_DISABLED");
        expect(response.body.details).toEqual({ module: "expenses" });
      }
      expect(await listCategories(alice, alice.household)).toContainEqual(
        category
      );
    });
  });

  describe("assertCategoryInHousehold", () => {
    it("accepts a category of the household", async () => {
      const { alice } = await createTwoHouseholds(app);
      const category = await createCategory(alice, alice.household, {
        name: "Pets",
      });

      await expect(
        assertCategoryInHousehold(db, alice.household.id, category.id)
      ).resolves.toBeUndefined();
      await db.transaction(async (tx) => {
        await assertCategoryInHousehold(tx, alice.household.id, category.id);
      });
    });

    it("rejects another household's category and a missing one alike", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      const bobs = await createCategory(bob, bob.household, { name: "Bob's" });
      const invalidReference = {
        status: 400,
        code: "INVALID_REFERENCE",
        details: {
          issues: [{ path: ["categoryId"], message: "Unknown category" }],
        },
      };

      await expect(
        assertCategoryInHousehold(db, alice.household.id, bobs.id)
      ).rejects.toMatchObject(invalidReference);
      await expect(
        assertCategoryInHousehold(db, alice.household.id, randomUUID())
      ).rejects.toMatchObject(invalidReference);
    });

    it("reports the path it was given", async () => {
      const { alice } = await createTwoHouseholds(app);

      await expect(
        assertCategoryInHousehold(db, alice.household.id, randomUUID(), [
          "items",
          0,
          "categoryId",
        ])
      ).rejects.toMatchObject({
        details: {
          issues: [
            { path: ["items", 0, "categoryId"], message: "Unknown category" },
          ],
        },
      });
    });
  });
});
