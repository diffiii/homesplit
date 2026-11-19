import { setTimeout as sleep } from "node:timers/promises";
import {
  ATTACHMENT_UPLOAD_FIELD,
  ConfirmReceiptResponse,
  Expense,
  ExpenseCategoryListResponse,
  Receipt,
  ReceiptSplit,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiClient } from "@/ai/ai-client";
import { FakeAiClient } from "@/ai/fake-ai-client";
import { db } from "@/db";
import { expenseAttachments, expenses, receipts } from "@/db/schema";
import { SUGGEST_CATEGORY_TASK } from "@/features/expense-categories/category-suggestions.service";
import {
  type ModelReceipt,
  SCAN_RECEIPT_TASK,
} from "@/features/receipts/receipt-draft";
import { expectApiError } from "./helpers/api";
import { createTestApp } from "./helpers/app";
import {
  createHousehold,
  createUser,
  inviteAndAccept,
  leaveHousehold,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");

/** The example from #56: beer 3 × 4.99 and pizza 30.00, 44.97 in all. */
const BEER_AND_PIZZA: ModelReceipt = {
  isReceipt: true,
  merchant: "Pizzeria",
  purchasedOn: "2026-11-07",
  currency: "PLN",
  total: 44.97,
  receiptDiscount: null,
  items: [
    {
      name: "Beer",
      quantity: 3,
      unitPrice: 4.99,
      discount: null,
      total: 14.97,
    },
    { name: "Pizza", quantity: 1, unitPrice: 30, discount: null, total: 30 },
  ],
};

const modelItem = (name: string, total: number, quantity = 1) => ({
  name,
  quantity,
  unitPrice: total / quantity,
  discount: null,
  total,
});

type Flat = { household: TestHousehold } & TestUser;

describe("receipt assignments and confirming", () => {
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

  /** Alice owns the household with `ai` on; Bob and Carol are members. */
  async function flat(): Promise<{ alice: Flat; bob: Flat; carol: Flat }> {
    const alice = await createUser(app, "Alice");
    const bob = await createUser(app, "Bob");
    const carol = await createUser(app, "Carol");
    const household = await createHousehold(alice);
    await inviteAndAccept(alice, household, bob);
    await inviteAndAccept(alice, household, carol);
    await alice.client
      .patch(`/api/households/${household.id}/features`)
      .send({ ai: true })
      .expect(200);
    return {
      alice: { ...alice, household },
      bob: { ...bob, household },
      carol: { ...carol, household },
    };
  }

  const receiptPath = ({ household }: Flat, receiptId: string) =>
    `/api/households/${household.id}/receipts/${receiptId}`;

  async function get(member: Flat, receiptId: string): Promise<Receipt> {
    const response = await member.client
      .get(receiptPath(member, receiptId))
      .expect(200);
    return Receipt.parse(response.body);
  }

  async function settled(
    member: Flat,
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

  async function startScan(member: Flat): Promise<Receipt> {
    const upload = await member.client
      .post(`/api/households/${member.household.id}/attachments`)
      .attach(ATTACHMENT_UPLOAD_FIELD, PDF, "file")
      .expect(201);
    const response = await member.client
      .post(`/api/households/${member.household.id}/receipts`)
      .send({ attachmentId: upload.body.id })
      .expect(201);
    return Receipt.parse(response.body);
  }

  async function scan(
    member: Flat,
    reply: ModelReceipt = BEER_AND_PIZZA
  ): Promise<Receipt> {
    fake.on(SCAN_RECEIPT_TASK, () => reply);
    const { id } = await startScan(member);
    const receipt = await settled(member, id);
    expect(receipt.status).toBe("ready");
    return receipt;
  }

  const assign = (
    member: Flat,
    receiptId: string,
    items: { assignees: { shares: number; userId: string }[]; itemId: string }[]
  ) =>
    member.client
      .put(`${receiptPath(member, receiptId)}/assignments`)
      .send({ items });

  /** Shares by user, e.g. `[[alice, 2], [bob, 1]]`. */
  const shares = (...pairs: [TestUser, number][]) =>
    pairs.map(([user, count]) => ({ userId: user.id, shares: count }));

  const equally = (...users: TestUser[]) =>
    shares(...users.map((user): [TestUser, number] => [user, 1]));

  async function split(member: Flat, receiptId: string) {
    const response = await member.client
      .get(`${receiptPath(member, receiptId)}/split`)
      .expect(200);
    return ReceiptSplit.parse(response.body);
  }

  const confirm = (member: Flat, receiptId: string, body: object = {}) =>
    member.client
      .post(`${receiptPath(member, receiptId)}/confirm`)
      .send({ categoryId: null, ...body });

  async function confirmed(member: Flat, receiptId: string, body?: object) {
    const response = await confirm(member, receiptId, body).expect(200);
    return ConfirmReceiptResponse.parse(response.body);
  }

  const amountsBy = (people: { amountCents: number; user: { id: string } }[]) =>
    Object.fromEntries(
      people.map(({ user, amountCents }) => [user.id, amountCents])
    );

  /** The beer by units, A 2 and B 1, and the pizza equally among all three. */
  async function assignExample(
    { alice, bob, carol }: { alice: Flat; bob: Flat; carol: Flat },
    receipt: Receipt
  ): Promise<Receipt> {
    const [beer, pizza] = receipt.items;
    const response = await assign(alice, receipt.id, [
      { itemId: beer?.id ?? "", assignees: shares([alice, 2], [bob, 1]) },
      { itemId: pizza?.id ?? "", assignees: equally(alice, bob, carol) },
    ]).expect(200);
    return Receipt.parse(response.body);
  }

  async function expenseCount(): Promise<number> {
    return (await db.select().from(expenses)).length;
  }

  describe("the example", () => {
    it("splits by units and equal shares, and confirms into an exact expense", async () => {
      const members = await flat();
      const { alice, bob, carol } = members;
      const receipt = await scan(alice);
      const assigned = await assignExample(members, receipt);

      const beerShares = Object.fromEntries(
        (assigned.items[0]?.assignments ?? []).map(
          ({ user, shares: count }) => [user.id, count]
        )
      );
      expect(beerShares).toEqual({ [alice.id]: 2, [bob.id]: 1 });

      const preview = await split(alice, receipt.id);
      expect(preview).toMatchObject({
        currency: "PLN",
        totalCents: 4497,
        unassignedCents: 0,
        unassignedItemIds: [],
        differenceCents: 0,
      });
      expect(amountsBy(preview.people)).toEqual({
        [alice.id]: 1998,
        [bob.id]: 1499,
        [carol.id]: 1000,
      });

      const result = await confirmed(alice, receipt.id);

      expect(result.expense).toMatchObject({
        name: "Pizzeria",
        expenseDate: "2026-11-07",
        total: { amountCents: 4497, currency: "PLN" },
        payers: [{ user: { id: alice.id }, amountCents: 4497 }],
        author: { id: alice.id },
        category: null,
        allocation: { method: "exact" },
        attachments: [{ id: receipt.attachmentId }],
        receiptId: receipt.id,
      });
      expect(amountsBy(result.expense.splits)).toEqual({
        [alice.id]: 1998,
        [bob.id]: 1499,
        [carol.id]: 1000,
      });
      expect(result.receipt).toMatchObject({
        status: "confirmed",
        expenseId: result.expense.id,
      });
      expect(result.receipt.items).toEqual(assigned.items);

      const expense = await alice.client
        .get(
          `/api/households/${alice.household.id}/expenses/${result.expense.id}`
        )
        .expect(200);
      expect(Expense.parse(expense.body)).toEqual(result.expense);
    });
  });

  describe("calculation", () => {
    it("gives leftover units by the allocation engine's remainder rule", async () => {
      const { alice, bob, carol } = await flat();
      const receipt = await scan(alice, {
        ...BEER_AND_PIZZA,
        total: 10,
        items: [modelItem("Wine", 10)],
      });
      const [wine] = receipt.items;
      await assign(alice, receipt.id, [
        { itemId: wine?.id ?? "", assignees: equally(alice, bob, carol) },
      ]).expect(200);

      const { expense } = await confirmed(alice, receipt.id);

      // 10.00 three ways; the leftover unit goes to the lowest user ID.
      const [first, ...rest] = [alice.id, bob.id, carol.id].sort();
      expect(amountsBy(expense.splits)).toEqual({
        [first ?? ""]: 334,
        ...Object.fromEntries(rest.map((id) => [id, 333])),
      });
    });

    it("spreads the receipt-level discount over the items by their cost", async () => {
      const { alice, bob } = await flat();
      const receipt = await scan(alice, {
        ...BEER_AND_PIZZA,
        total: 30,
        receiptDiscount: 10,
        items: [modelItem("Pizza", 30), modelItem("Salad", 10)],
      });
      const [pizza, salad] = receipt.items;
      await assign(alice, receipt.id, [
        { itemId: pizza?.id ?? "", assignees: equally(alice) },
        { itemId: salad?.id ?? "", assignees: equally(bob) },
      ]).expect(200);

      const { expense } = await confirmed(alice, receipt.id);

      expect(amountsBy(expense.splits)).toEqual({
        [alice.id]: 2250,
        [bob.id]: 750,
      });
    });

    it("splits weighed items by shares", async () => {
      const { alice, bob } = await flat();
      const receipt = await scan(alice, {
        ...BEER_AND_PIZZA,
        total: 17.89,
        items: [
          {
            name: "Cheese",
            quantity: 0.452,
            unitPrice: 39.58,
            discount: null,
            total: 17.89,
          },
        ],
      });
      const [cheese] = receipt.items;
      expect(cheese?.quantity).toBe(0.452);
      await assign(alice, receipt.id, [
        { itemId: cheese?.id ?? "", assignees: shares([alice, 3], [bob, 1]) },
      ]).expect(200);

      const { expense } = await confirmed(alice, receipt.id);

      expect(amountsBy(expense.splits)).toEqual({
        [alice.id]: 1342,
        [bob.id]: 447,
      });
    });

    it("reports unassigned items, and won't confirm until they're assigned", async () => {
      const { alice, bob } = await flat();
      const receipt = await scan(alice);
      const [beer, pizza] = receipt.items;
      await assign(alice, receipt.id, [
        { itemId: beer?.id ?? "", assignees: equally(alice, bob) },
      ]).expect(200);

      const preview = await split(alice, receipt.id);
      expect(preview).toMatchObject({
        totalCents: 4497,
        unassignedCents: 3000,
        unassignedItemIds: [pizza?.id],
      });
      // 14.97 two ways; which of them gets the leftover unit depends on the IDs.
      expect(
        Object.values(amountsBy(preview.people)).sort((a, b) => a - b)
      ).toEqual([748, 749]);

      const response = await confirm(alice, receipt.id).expect(409);
      expectApiError(response, "RECEIPT_ITEMS_UNASSIGNED");
      expect(response.body.details).toEqual({ itemIds: [pizza?.id] });
      expect(await expenseCount()).toBe(0);
    });

    it("won't confirm while the items don't add up to the total", async () => {
      const { alice } = await flat();
      const receipt = await scan(alice, { ...BEER_AND_PIZZA, total: 50 });
      await assign(
        alice,
        receipt.id,
        receipt.items.map(({ id }) => ({
          itemId: id,
          assignees: equally(alice),
        }))
      ).expect(200);

      expect(await split(alice, receipt.id)).toMatchObject({
        totalCents: 4497,
        differenceCents: -503,
      });
      const response = await confirm(alice, receipt.id).expect(409);
      expectApiError(response, "RECEIPT_TOTAL_MISMATCH");
      expect(response.body.details).toEqual({ differenceCents: -503 });
    });
  });

  describe("assignments", () => {
    it("replaces only the listed items, and clears an item with no assignees", async () => {
      const { alice, bob } = await flat();
      const receipt = await scan(alice);
      const [beer, pizza] = receipt.items;
      await assign(alice, receipt.id, [
        { itemId: beer?.id ?? "", assignees: equally(alice) },
        { itemId: pizza?.id ?? "", assignees: equally(alice) },
      ]).expect(200);

      const response = await assign(bob, receipt.id, [
        { itemId: beer?.id ?? "", assignees: [] },
      ]).expect(200);

      const updated = Receipt.parse(response.body);
      expect(updated.items[0]?.assignments).toEqual([]);
      expect(updated.items[1]?.assignments).toEqual([
        { user: expect.objectContaining({ id: alice.id }), shares: 1 },
      ]);
    });

    it("keeps the assignments of items that an edit keeps", async () => {
      const { alice, bob } = await flat();
      const receipt = await scan(alice);
      const [beer, pizza] = receipt.items;
      await assign(alice, receipt.id, [
        { itemId: beer?.id ?? "", assignees: equally(bob) },
        { itemId: pizza?.id ?? "", assignees: equally(alice) },
      ]).expect(200);

      const response = await alice.client
        .patch(receiptPath(alice, receipt.id))
        .send({
          items: [
            {
              id: pizza?.id,
              name: "Pizza",
              quantity: 1,
              unitPriceCents: 3000,
              totalCents: 3000,
            },
            { name: "Cola", quantity: 1, unitPriceCents: 500, totalCents: 500 },
          ],
        })
        .expect(200);

      const updated = Receipt.parse(response.body);
      expect(
        updated.items.map(({ name, assignments }) => [name, assignments.length])
      ).toEqual([
        ["Pizza", 1],
        ["Cola", 0],
      ]);
    });

    it.each([
      ["zero shares", { shares: 0 }],
      ["fractional shares", { shares: 1.5 }],
    ])("rejects %s", async (_case, override) => {
      const { alice } = await flat();
      const receipt = await scan(alice);
      const [beer] = receipt.items;

      const response = await assign(alice, receipt.id, [
        {
          itemId: beer?.id ?? "",
          assignees: [{ userId: alice.id, ...override }],
        },
      ]).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });

    it("rejects a user listed twice on one item", async () => {
      const { alice } = await flat();
      const receipt = await scan(alice);
      const [beer] = receipt.items;

      const response = await assign(alice, receipt.id, [
        { itemId: beer?.id ?? "", assignees: equally(alice, alice) },
      ]).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        {
          path: ["items", 0, "assignees", 1, "userId"],
          message: "Duplicate user id",
        },
      ]);
    });

    it("rejects someone who isn't a current member, and another receipt's item", async () => {
      const { alice, carol } = await flat();
      const outsider = await createUser(app, "Olga");
      const receipt = await scan(alice);
      const other = await scan(alice, {
        ...BEER_AND_PIZZA,
        items: [modelItem("Chips", 44.97)],
      });
      await leaveHousehold(carol, carol.household);
      const [beer] = receipt.items;

      const people = await assign(alice, receipt.id, [
        { itemId: beer?.id ?? "", assignees: equally(alice, outsider, carol) },
      ]).expect(400);
      expectApiError(people, "INVALID_REFERENCE");
      expect(
        people.body.details.issues.map(({ path }: { path: unknown }) => path)
      ).toEqual([
        ["items", 0, "assignees", 1, "userId"],
        ["items", 0, "assignees", 2, "userId"],
      ]);

      const item = await assign(alice, receipt.id, [
        { itemId: other.items[0]?.id ?? "", assignees: equally(alice) },
      ]).expect(400);
      expectApiError(item, "INVALID_REFERENCE");
      expect(item.body.details.issues).toEqual([
        { path: ["items", 0, "itemId"], message: "Unknown item" },
      ]);
    });

    it("hides another household's receipt", async () => {
      const { alice } = await flat();
      const receipt = await scan(alice);
      const stranger = await createUser(app, "Stan");
      const household = await createHousehold(stranger);
      const theirs = { ...stranger, household };

      await stranger.client
        .get(`${receiptPath(theirs, receipt.id)}/split`)
        .expect(404);
      await stranger.client
        .get(`${receiptPath(alice, receipt.id)}/split`)
        .expect(404);
      await assign(theirs, receipt.id, [
        { itemId: receipt.items[0]?.id ?? "", assignees: equally(stranger) },
      ]).expect(404);
      await confirm(theirs, receipt.id).expect(404);
    });
  });

  describe("confirming", () => {
    it("takes the payer, name, date, and description from the request", async () => {
      const members = await flat();
      const { alice, bob } = members;
      const receipt = await scan(alice);
      await assignExample(members, receipt);

      const { expense } = await confirmed(bob, receipt.id, {
        payerId: bob.id,
        name: "Friday pizza",
        description: "At Pizzeria",
        expenseDate: "2026-11-08",
      });

      expect(expense).toMatchObject({
        name: "Friday pizza",
        description: "At Pizzeria",
        expenseDate: "2026-11-08",
        author: { id: bob.id },
        payers: [{ user: { id: bob.id }, amountCents: 4497 }],
      });
    });

    it("defaults the category to a confident suggestion", async () => {
      const members = await flat();
      const { alice } = members;
      const receipt = await scan(alice);
      await assignExample(members, receipt);
      const categories = await alice.client
        .get(`/api/households/${alice.household.id}/expense-categories`)
        .expect(200);
      const { items } = ExpenseCategoryListResponse.parse(categories.body);
      const position = items.findIndex(({ name }) => name === "Groceries") + 1;
      fake.on(SUGGEST_CATEGORY_TASK, () => ({
        category: position,
        confidence: "high",
      }));

      const response = await alice.client
        .post(`${receiptPath(alice, receipt.id)}/confirm`)
        .send({})
        .expect(200);

      const { expense } = ConfirmReceiptResponse.parse(response.body);
      expect(expense.category?.id).toBe(items[position - 1]?.id);
      const suggestion = fake.requests.find(
        ({ task }) => task === SUGGEST_CATEGORY_TASK
      );
      expect(JSON.stringify(suggestion?.input)).toContain("Beer, Pizza");
    });

    it("leaves the category empty when the suggestion isn't confident", async () => {
      const members = await flat();
      const { alice } = members;
      const receipt = await scan(alice);
      await assignExample(members, receipt);
      fake.on(SUGGEST_CATEGORY_TASK, () => ({
        category: 1,
        confidence: "low",
      }));

      const response = await alice.client
        .post(`${receiptPath(alice, receipt.id)}/confirm`)
        .send({})
        .expect(200);

      expect(
        ConfirmReceiptResponse.parse(response.body).expense.category
      ).toBeNull();
    });

    it("validates like a manual expense", async () => {
      const members = await flat();
      const { alice } = members;
      const outsider = await createUser(app, "Olga");
      const receipt = await scan(alice, { ...BEER_AND_PIZZA, merchant: null });
      await assignExample(members, receipt);

      const noName = await confirm(alice, receipt.id).expect(400);
      expectApiError(noName, "VALIDATION_ERROR");
      expect(noName.body.details.issues).toEqual([
        { path: ["name"], message: expect.any(String) },
      ]);

      const payer = await confirm(alice, receipt.id, {
        name: "Pizza",
        payerId: outsider.id,
      }).expect(400);
      expectApiError(payer, "INVALID_REFERENCE");
      expect(payer.body.details.issues).toEqual([
        { path: ["payerId"], message: expect.any(String) },
      ]);
      expect(await expenseCount()).toBe(0);
    });

    it("won't confirm with an assignee who has left", async () => {
      const members = await flat();
      const { alice, carol } = members;
      const receipt = await scan(alice);
      await assignExample(members, receipt);
      await leaveHousehold(carol, carol.household);

      const response = await confirm(alice, receipt.id).expect(409);

      expectApiError(response, "RECEIPT_ASSIGNEE_NOT_MEMBER");
      expect(response.body.details).toEqual({ userIds: [carol.id] });
    });

    it("rejects confirming twice, and keeps a confirmed receipt read-only", async () => {
      const members = await flat();
      const { alice } = members;
      const receipt = await scan(alice);
      await assignExample(members, receipt);
      await confirmed(alice, receipt.id);

      expectApiError(
        await confirm(alice, receipt.id).expect(409),
        "RECEIPT_CONFIRMED"
      );
      expectApiError(
        await assign(alice, receipt.id, [
          { itemId: receipt.items[0]?.id ?? "", assignees: equally(alice) },
        ]).expect(409),
        "RECEIPT_CONFIRMED"
      );
      expect(await expenseCount()).toBe(1);
    });

    it("rejects a receipt that is still being read", async () => {
      const { alice } = await flat();
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      fake.on(SCAN_RECEIPT_TASK, async () => {
        await gate;
        return BEER_AND_PIZZA;
      });
      const { id } = await startScan(alice);

      expectApiError(
        await confirm(alice, id).expect(409),
        "RECEIPT_PROCESSING"
      );

      open();
      await settled(alice, id);
    });

    it("rolls everything back when a step fails", async () => {
      const members = await flat();
      const { alice } = members;
      const receipt = await scan(alice);
      const assigned = await assignExample(members, receipt);
      // Fails the last step, after the expense and the link are written.
      await db.execute(
        sql.raw(`CREATE FUNCTION fail_receipt_confirm() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'confirm failed'; END $$`)
      );
      await db.execute(
        sql.raw(`CREATE TRIGGER fail_receipt_confirm BEFORE UPDATE ON receipts
          FOR EACH ROW WHEN (NEW.status = 'confirmed')
          EXECUTE FUNCTION fail_receipt_confirm()`)
      );
      try {
        expectApiError(
          await confirm(alice, receipt.id).expect(500),
          "INTERNAL_ERROR"
        );
      } finally {
        await db.execute(
          sql.raw("DROP TRIGGER fail_receipt_confirm ON receipts")
        );
        await db.execute(sql.raw("DROP FUNCTION fail_receipt_confirm()"));
      }

      expect(await expenseCount()).toBe(0);
      expect(await db.select().from(expenseAttachments)).toHaveLength(0);
      expect(await get(alice, receipt.id)).toEqual(assigned);

      await confirmed(alice, receipt.id);
    });
  });

  describe("after confirming", () => {
    async function confirmedExample() {
      const members = await flat();
      const receipt = await scan(members.alice);
      await assignExample(members, receipt);
      const result = await confirmed(members.alice, receipt.id);
      return { ...members, ...result };
    }

    const expensePath = ({ household }: Flat, expenseId: string) =>
      `/api/households/${household.id}/expenses/${expenseId}`;

    it("keeps the link when only descriptive fields change", async () => {
      const { alice, expense, receipt } = await confirmedExample();

      const response = await alice.client
        .patch(expensePath(alice, expense.id))
        .send({ name: "Pizza night" })
        .expect(200);

      expect(Expense.parse(response.body).receiptId).toBe(receipt.id);
      expect((await get(alice, receipt.id)).expenseId).toBe(expense.id);
    });

    it("unlinks the receipt when the amounts change, and keeps it confirmed", async () => {
      const { alice, bob, expense, receipt } = await confirmedExample();

      const response = await alice.client
        .patch(expensePath(alice, expense.id))
        .send({
          financial: {
            total: { amountCents: 4497, currency: "PLN" },
            payers: [{ userId: alice.id, amountCents: 4497 }],
            allocation: {
              method: "equal",
              participants: [{ userId: alice.id }, { userId: bob.id }],
            },
          },
        })
        .expect(200);

      const edited = Expense.parse(response.body);
      expect(edited.receiptId).toBeNull();
      expect(edited.attachments).toEqual([
        expect.objectContaining({ id: receipt.attachmentId }),
      ]);
      const unlinked = await get(alice, receipt.id);
      expect(unlinked).toMatchObject({ status: "confirmed", expenseId: null });
      expect(unlinked.items).toEqual(receipt.items);
      expectApiError(
        await confirm(alice, receipt.id).expect(409),
        "RECEIPT_CONFIRMED"
      );
    });

    it("puts the receipt back to ready when the expense is deleted", async () => {
      const { alice, expense, receipt } = await confirmedExample();

      await alice.client.delete(expensePath(alice, expense.id)).expect(204);

      const ready = await get(alice, receipt.id);
      expect(ready).toMatchObject({ status: "ready", expenseId: null });
      expect(ready.items).toEqual(receipt.items);

      const again = await confirmed(alice, receipt.id);
      expect(again.expense.id).not.toBe(expense.id);
      expect(await db.select().from(receipts)).toHaveLength(1);
    });

    it("ties the receipt to its expense in the database", async () => {
      const { expense, receipt } = await confirmedExample();

      const [row] = await db
        .select({ expenseId: receipts.expenseId })
        .from(receipts)
        .where(eq(receipts.id, receipt.id));
      expect(row?.expenseId).toBe(expense.id);
    });
  });
});
