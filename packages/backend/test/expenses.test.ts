import {
  ApiError,
  allocate,
  Expense,
  type ExpenseAllocationInput,
  ExpenseListResponse,
  MAX_AMOUNT_CENTS,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  expenseAllocationParticipants,
  expenseCategories,
  expensePayers,
  expenseSplits,
  expenses,
} from "@/db/schema";
import { createTestApp } from "./helpers/app";
import { insertExpense } from "./helpers/expenses";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const expensesPath = (householdId: string) =>
  `/api/households/${householdId}/expenses`;

const expensePath = (householdId: string, expenseId: string) =>
  `${expensesPath(householdId)}/${expenseId}`;

/** `payer` pays all of `amountCents`, split equally among `participants`. */
const expense = (
  payer: TestUser,
  participants: TestUser[],
  amountCents = 1000
) => ({
  name: "Groceries",
  total: { amountCents, currency: "PLN" },
  expenseDate: "2026-10-01",
  payers: [{ userId: payer.id, amountCents }],
  allocation: {
    method: "equal",
    participants: participants.map(({ id }) => ({ userId: id })),
  },
});

const byUserId = <T extends { userId: string }>(entries: T[]) =>
  entries.toSorted((a, b) => (a.userId < b.userId ? -1 : 1));

/** Payers or splits in the request's shape, to compare with what was sent. */
const asInput = (entries: Expense["splits"]) =>
  entries.map(({ user, amountCents }) => ({ userId: user.id, amountCents }));

function expectApiError(response: Response, code: string): ApiError {
  const error = ApiError.parse(response.body);
  expect(error.code).toBe(code);
  return error;
}

const storedExpenses = (householdId: string) =>
  db.select().from(expenses).where(eq(expenses.householdId, householdId));

describe("expenses", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Alice owns the household, Carol and Dave are its members, and Bob owns
   * another household.
   */
  async function setup() {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    const dave = await createUser(app, "Dave");
    await inviteAndAccept(alice, alice.household, carol);
    await inviteAndAccept(alice, alice.household, dave);
    return { alice, bob, carol, dave, household: alice.household };
  }

  async function create(
    author: TestUser,
    household: TestHousehold,
    body: object
  ): Promise<Expense> {
    const response = await author.client
      .post(expensesPath(household.id))
      .send(body)
      .expect(201);
    return Expense.parse(response.body);
  }

  async function get(
    reader: TestUser,
    household: TestHousehold,
    expenseId: string
  ): Promise<Expense> {
    const response = await reader.client
      .get(expensePath(household.id, expenseId))
      .expect(200);
    return Expense.parse(response.body);
  }

  async function list(
    reader: TestUser,
    household: TestHousehold,
    query = ""
  ): Promise<ExpenseListResponse> {
    const response = await reader.client
      .get(`${expensesPath(household.id)}${query}`)
      .expect(200);
    return ExpenseListResponse.parse(response.body);
  }

  async function categoryOf(household: TestHousehold) {
    const [category] = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.householdId, household.id))
      .limit(1);
    return category;
  }

  describe("creating", () => {
    // Alice pays without taking part, and Dave takes part without paying.
    it.each([
      ["equal", [{}, {}]],
      ["percentage", [{ basisPoints: 6000 }, { basisPoints: 4000 }]],
      ["shares", [{ shares: 1 }, { shares: 3 }]],
      ["exact", [{ amountCents: 700 }, { amountCents: 300 }]],
      ["adjustment", [{ adjustmentCents: 100 }, { adjustmentCents: -100 }]],
    ])("stores a %s split and reads it back", async (method, inputs) => {
      const { alice, carol, dave, household } = await setup();
      const allocation = {
        method,
        participants: [carol, dave].map((member, index) => ({
          userId: member.id,
          ...inputs[index],
        })),
      } as ExpenseAllocationInput;
      const payers = [
        { userId: alice.id, amountCents: 600 },
        { userId: carol.id, amountCents: 400 },
      ];

      const created = await create(carol, household, {
        ...expense(alice, []),
        payers,
        allocation,
      });

      expect(await get(dave, household, created.id)).toEqual(created);
      expect(created).toMatchObject({ description: null, category: null });
      expect(asInput(created.payers)).toEqual(byUserId(payers));
      expect(created.allocation).toEqual({
        method,
        participants: byUserId(allocation.participants),
      });
      expect(asInput(created.splits)).toEqual(
        byUserId(allocate(1000, allocation))
      );
    });

    it.each([
      ["exact", { amountCents: 1000 }, { amountCents: 0 }],
      ["adjustment", { adjustmentCents: 500 }, { adjustmentCents: -500 }],
    ])("stores a zero %s split", async (method, aliceInput, carolInput) => {
      const { alice, carol, household } = await setup();

      const created = await create(alice, household, {
        ...expense(alice, []),
        allocation: {
          method,
          participants: [
            { userId: alice.id, ...aliceInput },
            { userId: carol.id, ...carolInput },
          ],
        },
      });

      expect(created.splits).toContainEqual({
        user: { id: carol.id, name: "Carol", imageUrl: null },
        amountCents: 0,
      });
    });

    it("keeps the largest amount and a leap day exact", async () => {
      const { alice, carol, household } = await setup();

      const created = await create(alice, household, {
        ...expense(alice, [alice, carol], MAX_AMOUNT_CENTS),
        expenseDate: "2024-02-29",
      });

      expect(created.total.amountCents).toBe(MAX_AMOUNT_CENTS);
      expect(created.payers[0].amountCents).toBe(MAX_AMOUNT_CENTS);
      expect(created.expenseDate).toBe("2024-02-29");
      const [stored] = await storedExpenses(household.id);
      expect(stored).toMatchObject({
        totalAmountCents: BigInt(MAX_AMOUNT_CENTS),
        expenseDate: "2024-02-29",
      });
    });

    it("sets the author and timestamps from the server", async () => {
      const { alice, carol, household } = await setup();
      const category = await categoryOf(household);

      const created = await create(carol, household, {
        ...expense(alice, [alice, carol]),
        description: "Weekly shop",
        categoryId: category.id,
      });

      expect(created).toMatchObject({
        householdId: household.id,
        description: "Weekly shop",
        author: { id: carol.id, name: "Carol", imageUrl: null },
        category,
      });
      const [stored] = await storedExpenses(household.id);
      expect(created.createdAt).toBe(stored.createdAt.toISOString());
      expect(created.updatedAt).toBe(created.createdAt);
    });

    it.each([
      [
        "client splits",
        (alice: TestUser) => ({
          splits: [{ userId: alice.id, amountCents: 1000 }],
        }),
      ],
      ["an author", (alice: TestUser) => ({ authorId: alice.id })],
    ])("rejects %s", async (_, override) => {
      const { alice, household } = await setup();

      const response = await alice.client
        .post(expensesPath(household.id))
        .send({ ...expense(alice, [alice]), ...override(alice) })
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(await storedExpenses(household.id)).toEqual([]);
    });

    it("rejects duplicate payers and participants with their paths", async () => {
      const { alice, carol, household } = await setup();

      const response = await alice.client
        .post(expensesPath(household.id))
        .send({
          ...expense(alice, [carol, carol]),
          payers: [
            { userId: alice.id, amountCents: 500 },
            { userId: alice.id, amountCents: 500 },
          ],
        })
        .expect(400);

      expect(expectApiError(response, "VALIDATION_ERROR").details).toEqual({
        issues: [
          { path: ["payers", 1, "userId"], message: "Duplicate user" },
          {
            path: ["allocation", "participants", 1, "userId"],
            message: "Duplicate user",
          },
        ],
      });
    });

    it("needs the expenses module, while reads keep working", async () => {
      const { alice, carol, household } = await setup();
      const created = await create(alice, household, expense(alice, [alice]));
      await alice.client
        .patch(`/api/households/${household.id}/features`)
        .send({ expenses: false })
        .expect(200);

      const response = await carol.client
        .post(expensesPath(household.id))
        .send(expense(carol, [carol]))
        .expect(403);

      expectApiError(response, "MODULE_DISABLED");
      expect(await get(carol, household, created.id)).toEqual(created);
      expect((await list(carol, household)).items).toEqual([created]);
    });

    it("stores nothing when a write fails partway", async () => {
      const { alice, carol, household } = await setup();
      await db.execute(
        sql.raw(`
          CREATE FUNCTION "reject_split"() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'split failed';
          END;
          $$;
          CREATE TRIGGER "reject_split"
          BEFORE INSERT ON "expense_splits"
          FOR EACH ROW EXECUTE FUNCTION "reject_split"();
        `)
      );
      let response: Response;
      try {
        response = await alice.client
          .post(expensesPath(household.id))
          .send(expense(alice, [alice, carol]));
      } finally {
        await db.execute(
          sql.raw(`
            DROP TRIGGER "reject_split" ON "expense_splits";
            DROP FUNCTION "reject_split"();
          `)
        );
      }

      expectApiError(response, "INTERNAL_ERROR");
      const stored = await Promise.all([
        db.select().from(expenses),
        db.select().from(expensePayers),
        db.select().from(expenseAllocationParticipants),
        db.select().from(expenseSplits),
      ]);
      expect(stored).toEqual([[], [], [], []]);
    });
  });

  describe("references", () => {
    const userIssue = (path: (string | number)[]) => ({
      path,
      message: "Unknown or ineligible user",
    });

    it("rejects payers and participants from another household", async () => {
      const { alice, bob, carol, household } = await setup();

      const response = await alice.client
        .post(expensesPath(household.id))
        .send({
          ...expense(bob, [carol, bob]),
          payers: [
            { userId: alice.id, amountCents: 400 },
            { userId: bob.id, amountCents: 600 },
          ],
        })
        .expect(400);

      expect(expectApiError(response, "INVALID_REFERENCE").details).toEqual({
        issues: [
          userIssue(["payers", 1, "userId"]),
          userIssue(["allocation", "participants", 1, "userId"]),
        ],
      });
      expect(await storedExpenses(household.id)).toEqual([]);
    });

    it("rejects a departed member as payer or participant", async () => {
      const { alice, carol, household } = await setup();
      await removeMember(alice, household, carol);

      const response = await alice.client
        .post(expensesPath(household.id))
        .send(expense(carol, [alice, carol]))
        .expect(400);

      expect(expectApiError(response, "INVALID_REFERENCE").details).toEqual({
        issues: [
          userIssue(["payers", 0, "userId"]),
          userIssue(["allocation", "participants", 1, "userId"]),
        ],
      });
    });

    it("rejects another household's category", async () => {
      const { alice, bob, household } = await setup();
      const category = await categoryOf(bob.household);

      const response = await alice.client
        .post(expensesPath(household.id))
        .send({ ...expense(alice, [alice]), categoryId: category.id })
        .expect(400);

      expect(expectApiError(response, "INVALID_REFERENCE").details).toEqual({
        issues: [{ path: ["categoryId"], message: "Unknown category" }],
      });
    });
  });

  describe("access", () => {
    it("answers 404 to non-members and for another household's expense", async () => {
      const { alice, bob, household } = await setup();
      const created = await create(alice, household, expense(alice, [alice]));

      const responses = await Promise.all([
        bob.client.get(expensesPath(household.id)),
        bob.client.get(expensePath(household.id, created.id)),
        bob.client.post(expensesPath(household.id)).send(expense(bob, [bob])),
        bob.client.get(expensePath(bob.household.id, created.id)),
      ]);

      for (const response of responses) {
        expectApiError(response, "NOT_FOUND");
      }
      expect(await storedExpenses(household.id)).toHaveLength(1);
    });
  });

  describe("list", () => {
    it("pages through expenses by date, creation time, and id", async () => {
      const { alice, household } = await setup();
      const id = (suffix: number) =>
        `00000000-0000-4000-8000-00000000000${suffix}`;
      const row = (suffix: number, expenseDate: string, createdAt: string) =>
        insertExpense(db, {
          id: id(suffix),
          householdId: household.id,
          authorId: alice.id,
          expenseDate,
          createdAt: new Date(createdAt),
        });
      const earlier = "2026-10-01T12:00:00Z";
      await row(3, "2026-10-01", earlier);
      await row(7, "2026-09-30", "2026-10-05T12:00:00Z");
      await row(1, "2026-10-01", earlier);
      await row(6, "2026-10-01", "2026-10-02T12:00:00Z");
      await row(5, "2026-10-01", earlier);
      await row(2, "2026-10-02", earlier);
      await row(4, "2026-10-01", earlier);

      const pages = [
        await list(alice, household, "?page=1&pageSize=3"),
        await list(alice, household, "?page=2&pageSize=3"),
        await list(alice, household, "?page=3&pageSize=3"),
      ];
      const pastTheEnd = await list(alice, household, "?page=4&pageSize=3");

      expect(
        pages.flatMap((page) => page.items.map((item) => item.id))
      ).toEqual([2, 6, 5, 4, 3, 1, 7].map(id));
      expect(pages.map((page) => page.totalItems)).toEqual([7, 7, 7]);
      expect(pastTheEnd).toEqual({
        items: [],
        page: 4,
        pageSize: 3,
        totalItems: 7,
      });
    });

    it("keeps each household's expenses to itself", async () => {
      const { alice, bob, household } = await setup();
      const ours = await create(alice, household, expense(alice, [alice]));
      const theirs = await create(bob, bob.household, expense(bob, [bob]));

      expect((await list(alice, household)).items).toEqual([ours]);
      expect((await list(bob, bob.household)).items).toEqual([theirs]);
    });

    it("still shows a departed author, payer, and participant", async () => {
      const { alice, carol, household } = await setup();
      const created = await create(
        carol,
        household,
        expense(carol, [alice, carol])
      );
      await removeMember(alice, household, carol);

      const [listed] = (await list(alice, household)).items;

      expect(listed).toEqual(created);
      expect(listed.author).toEqual({
        id: carol.id,
        name: "Carol",
        imageUrl: null,
      });
    });
  });
});
