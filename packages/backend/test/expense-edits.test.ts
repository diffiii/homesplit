import { ApiError, Expense, ExpenseFinancialSpec } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, type Transaction } from "@/db";
import {
  expenseAllocationParticipants,
  expensePayers,
  expenseSplits,
  settlements,
} from "@/db/schema";
import { updateAggregate } from "@/features/expenses/expenses/expenses.repository";
import { createTestApp } from "./helpers/app";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

const expensePath = (householdId: string, expenseId = "") =>
  `/api/households/${householdId}/expenses/${expenseId}`;

/** `payer` pays `amountCents`, split equally among `participants`. */
const financial = (
  payer: TestUser,
  participants: TestUser[],
  amountCents = 1000
) => ({
  total: { amountCents, currency: "PLN" },
  payers: [{ userId: payer.id, amountCents }],
  allocation: {
    method: "equal",
    participants: participants.map(({ id }) => ({ userId: id })),
  },
});

/** Splits in the request's shape. */
const splitsOf = (expense: Expense) =>
  expense.splits.map(({ user, amountCents }) => ({
    userId: user.id,
    amountCents,
  }));

const participantIds = (expense: Expense) =>
  expense.allocation.participants.map(({ userId }) => userId);

function expectApiError(response: Response, code: string): ApiError {
  const error = ApiError.parse(response.body);
  expect(error.code).toBe(code);
  return error;
}

const childRowCounts = (expenseId: string) =>
  Promise.all(
    [expensePayers, expenseAllocationParticipants, expenseSplits].map((table) =>
      db.$count(table, eq(table.expenseId, expenseId))
    )
  );

describe("expense edits", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Alice owns the household, Carol and Dave are its members. */
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
    spec: object
  ): Promise<Expense> {
    const response = await author.client
      .post(expensePath(household.id))
      .send({ name: "Groceries", expenseDate: "2026-10-01", ...spec })
      .expect(201);
    return Expense.parse(response.body);
  }

  async function get(
    reader: TestUser,
    household: TestHousehold,
    expense: Expense
  ): Promise<Expense> {
    const response = await reader.client
      .get(expensePath(household.id, expense.id))
      .expect(200);
    return Expense.parse(response.body);
  }

  /** Adds an expense Alice paid 90.00 for, split equally among all three. */
  async function setupWithExpense() {
    const ctx = await setup();
    const { alice, carol, dave, household } = ctx;
    const expense = await create(
      alice,
      household,
      financial(alice, [alice, carol, dave], 9000)
    );
    return { ...ctx, expense };
  }

  const patch = (
    editor: TestUser,
    household: TestHousehold,
    expense: Expense,
    body: object
  ) => editor.client.patch(expensePath(household.id, expense.id)).send(body);

  /**
   * Holds the expense's row lock and replaces its financial state the way an
   * overlapping `PATCH` would, until the transaction commits.
   */
  const replaceWhileLocked =
    (household: TestHousehold, expense: Expense, body: object) =>
    (tx: Transaction) =>
      updateAggregate(tx, household.id, expense.id, {
        financial: ExpenseFinancialSpec.parse(body),
      });

  it("replaces the financial state as a whole", async () => {
    const { alice, carol, household, expense } = await setupWithExpense();

    const response = await patch(alice, household, expense, {
      financial: {
        total: { amountCents: 3000, currency: "EUR" },
        payers: [{ userId: carol.id, amountCents: 3000 }],
        allocation: {
          method: "exact",
          participants: [{ userId: carol.id, amountCents: 3000 }],
        },
      },
    }).expect(200);

    const updated = Expense.parse(response.body);
    expect(updated).toMatchObject({
      name: expense.name,
      createdAt: expense.createdAt,
      total: { amountCents: 3000, currency: "EUR" },
    });
    expect(splitsOf(updated)).toEqual([
      { userId: carol.id, amountCents: 3000 },
    ]);
    expect(await childRowCounts(expense.id)).toEqual([1, 1, 1]);
  });

  it("leaves the financial state untouched in a descriptive patch", async () => {
    const { alice, household, expense } = await setupWithExpense();

    const response = await patch(alice, household, expense, {
      name: "Market",
    }).expect(200);

    expect(Expense.parse(response.body)).toEqual({
      ...expense,
      name: "Market",
      updatedAt: response.body.updatedAt,
    });
  });

  it.each([
    [
      "payers that don't add up",
      () => ({
        total: { amountCents: 2000, currency: "PLN" },
      }),
      "VALIDATION_ERROR",
    ],
    [
      "a payer from another household",
      (bob: TestUser) => ({
        payers: [{ userId: bob.id, amountCents: 9000 }],
      }),
      "INVALID_REFERENCE",
    ],
  ])("rejects %s and keeps the expense", async (_, override, code) => {
    const { alice, bob, household, expense } = await setupWithExpense();

    const response = await patch(alice, household, expense, {
      financial: {
        ...financial(alice, [alice], 9000),
        ...override(bob),
      },
    }).expect(400);

    expectApiError(response, code);
    expect(await get(alice, household, expense)).toEqual(expense);
  });

  it("rolls back a replacement that fails partway", async () => {
    const { alice, carol, household, expense } = await setupWithExpense();
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
      response = await patch(alice, household, expense, {
        financial: financial(carol, [carol]),
      });
    } finally {
      await db.execute(
        sql.raw(`
          DROP TRIGGER "reject_split" ON "expense_splits";
          DROP FUNCTION "reject_split"();
        `)
      );
    }

    expectApiError(response, "INTERNAL_ERROR");
    expect(await get(alice, household, expense)).toEqual(expense);
    expect(await childRowCounts(expense.id)).toEqual([1, 3, 3]);
  });

  // The example from "Historical expense edits" in docs/decisions.md.
  it("keeps a departed participant on a corrected expense", async () => {
    const { alice, carol, dave, household, expense } = await setupWithExpense();
    await removeMember(alice, household, dave);

    const response = await patch(alice, household, expense, {
      financial: financial(alice, [alice, carol, dave], 12_000),
    }).expect(200);

    expect(
      Expense.parse(response.body).splits.map((split) => split.amountCents)
    ).toEqual([4000, 4000, 4000]);
  });

  it("lets a departed participant be removed, but not added back", async () => {
    const { alice, carol, dave, household, expense } = await setupWithExpense();
    await removeMember(alice, household, dave);

    await patch(alice, household, expense, {
      financial: financial(alice, [alice, carol], 9000),
    }).expect(200);
    const response = await patch(alice, household, expense, {
      financial: financial(alice, [alice, dave], 9000),
    }).expect(400);

    expect(expectApiError(response, "INVALID_REFERENCE").details).toEqual({
      issues: [
        {
          path: ["financial", "allocation", "participants", 1, "userId"],
          message: "Unknown or ineligible user",
        },
      ],
    });
  });

  it("enforces the author-or-admin rule and the module flag", async () => {
    const { alice, carol, dave, household } = await setup();
    const expense = await create(carol, household, financial(carol, [carol]));

    expectApiError(
      await patch(dave, household, expense, { name: "Market" }),
      "FORBIDDEN"
    );
    expectApiError(
      await dave.client.delete(expensePath(household.id, expense.id)),
      "FORBIDDEN"
    );
    await patch(alice, household, expense, { name: "Market" }).expect(200);
    await alice.client
      .patch(`/api/households/${household.id}/features`)
      .send({ expenses: false })
      .expect(200);
    expectApiError(
      await patch(carol, household, expense, { name: "Shop" }),
      "MODULE_DISABLED"
    );
    expectApiError(
      await carol.client.delete(expensePath(household.id, expense.id)),
      "MODULE_DISABLED"
    );
  });

  it("deletes the expense with its child rows, but not payments", async () => {
    const { alice, carol, household, expense } = await setupWithExpense();
    await carol.client
      .post(`/api/households/${household.id}/settlements`)
      .send({
        payerId: carol.id,
        payeeId: alice.id,
        amount: { amountCents: 3000, currency: "PLN" },
      })
      .expect(201);

    await alice.client
      .delete(expensePath(household.id, expense.id))
      .expect(204);

    await alice.client.get(expensePath(household.id, expense.id)).expect(404);
    expect(await childRowCounts(expense.id)).toEqual([0, 0, 0]);
    expect(await db.$count(settlements)).toBe(1);
  });

  describe("overlapping replacements", () => {
    it("apply one after the other, each as a whole", async () => {
      const { alice, carol, dave, household, expense } =
        await setupWithExpense();

      const response = await sendDuring(
        replaceWhileLocked(household, expense, financial(dave, [alice, dave])),
        () =>
          patch(alice, household, expense, {
            financial: financial(carol, [carol], 3000),
          })
      );

      expect(response.status).toBe(200);
      const stored = await get(alice, household, expense);
      expect(stored.total.amountCents).toBe(3000);
      expect(participantIds(stored)).toEqual([carol.id]);
      expect(splitsOf(stored)).toEqual([
        { userId: carol.id, amountCents: 3000 },
      ]);
    });

    it("check departed users against the replacement they waited for", async () => {
      const { alice, carol, dave, household, expense } =
        await setupWithExpense();
      await removeMember(alice, household, dave);

      const response = await sendDuring(
        replaceWhileLocked(household, expense, financial(alice, [carol])),
        () =>
          patch(alice, household, expense, {
            financial: financial(alice, [alice, dave], 9000),
          })
      );

      expectApiError(response, "INVALID_REFERENCE");
      expect(participantIds(await get(alice, household, expense))).toEqual([
        carol.id,
      ]);
    });
  });
});
