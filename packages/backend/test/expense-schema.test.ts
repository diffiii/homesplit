import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
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
} from "./helpers/fixtures";

type NewExpense = typeof expenses.$inferInsert;
type NewParticipant = typeof expenseAllocationParticipants.$inferInsert;

async function expectViolation(
  write: Promise<unknown>,
  constraint: string
): Promise<void> {
  await expect(write).rejects.toMatchObject({ cause: { constraint } });
}

describe("expense schema", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Alice's household with Carol as a member and one expense, and Bob's
   * household with one category.
   */
  async function setup() {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    await inviteAndAccept(alice, alice.household, carol);
    const householdId = alice.household.id;
    const expenseId = await insertExpense(db, {
      householdId,
      authorId: alice.id,
    });
    const [bobsCategory] = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.householdId, bob.household.id))
      .limit(1);

    const expense = (overrides: Partial<NewExpense> = {}): NewExpense => ({
      householdId,
      name: "Rent",
      totalAmountCents: 1000n,
      currency: "PLN",
      allocationMethod: "equal",
      authorId: alice.id,
      expenseDate: "2026-02-01",
      ...overrides,
    });

    /** Carol as a new child row of the expense. */
    const child = { expenseId, householdId, userId: carol.id };

    /** Adds an expense with `allocationMethod` and returns a participant insert. */
    async function expenseWith(allocationMethod: string) {
      const [{ id }] = await db
        .insert(expenses)
        .values(expense({ allocationMethod }))
        .returning({ id: expenses.id });
      return (participant: Partial<NewParticipant>) =>
        db.insert(expenseAllocationParticipants).values({
          expenseId: id,
          householdId,
          userId: alice.id,
          allocationMethod,
          ...participant,
        });
    }

    return {
      alice,
      bob,
      bobsCategory,
      carol,
      child,
      expense,
      expenseId,
      expenseWith,
      householdId,
    };
  }

  describe("expenses", () => {
    it.each([
      [
        "a zero total",
        { totalAmountCents: 0n },
        "expenses_total_amount_positive",
      ],
      ["a lowercase currency", { currency: "pln" }, "expenses_currency_code"],
      [
        "an unknown method",
        { allocationMethod: "weights" },
        "expenses_allocation_method",
      ],
      ["an empty name", { name: "" }, "expenses_name_not_empty"],
      [
        "an empty description",
        { description: "" },
        "expenses_description_not_empty",
      ],
    ])("rejects %s", async (_, overrides, constraint) => {
      const { expense } = await setup();

      await expectViolation(
        db.insert(expenses).values(expense(overrides)),
        constraint
      );
    });

    it("rejects another household's category", async () => {
      const { bobsCategory, expense } = await setup();

      await expectViolation(
        db.insert(expenses).values(expense({ categoryId: bobsCategory.id })),
        "expenses_category_fk"
      );
    });

    it("rejects an author who was never a member", async () => {
      const { bob, expense } = await setup();

      await expectViolation(
        db.insert(expenses).values(expense({ authorId: bob.id })),
        "expenses_author_party_fk"
      );
    });

    it("deletes its child rows with it", async () => {
      const { expenseId } = await setup();

      await db.delete(expenses).where(eq(expenses.id, expenseId));

      const children = await Promise.all(
        [expensePayers, expenseAllocationParticipants, expenseSplits].map(
          (table) =>
            db.select().from(table).where(eq(table.expenseId, expenseId))
        )
      );
      expect(children).toEqual([[], [], []]);
    });
  });

  describe("payers", () => {
    it("rejects a non-positive amount", async () => {
      const { child } = await setup();

      await expectViolation(
        db.insert(expensePayers).values({ ...child, amountCents: 0n }),
        "expense_payers_amount_positive"
      );
    });

    it("rejects a repeated payer", async () => {
      const { alice, child } = await setup();

      await expectViolation(
        db
          .insert(expensePayers)
          .values({ ...child, userId: alice.id, amountCents: 1n }),
        "expense_payers_expense_id_user_id_pk"
      );
    });

    it("rejects a user who was never a member of the household", async () => {
      const { bob, child } = await setup();

      await expectViolation(
        db
          .insert(expensePayers)
          .values({ ...child, userId: bob.id, amountCents: 1n }),
        "expense_payers_party_fk"
      );
    });

    it("rejects a row in another household than its expense", async () => {
      const { bob, child } = await setup();

      await expectViolation(
        db.insert(expensePayers).values({
          ...child,
          householdId: bob.household.id,
          userId: bob.id,
          amountCents: 1n,
        }),
        "expense_payers_expense_fk"
      );
    });
  });

  describe("splits", () => {
    it("rejects a negative amount and accepts a zero one", async () => {
      const { child } = await setup();

      await expectViolation(
        db.insert(expenseSplits).values({ ...child, amountCents: -1n }),
        "expense_splits_amount_nonnegative"
      );
      await db.insert(expenseSplits).values({ ...child, amountCents: 0n });
    });
  });

  describe("allocation participants", () => {
    it.each([
      ["equal", null],
      ["percentage", 2500n],
      ["shares", 3n],
      ["exact", 0n],
      ["adjustment", -500n],
    ])("stores a %s participant with value %s", async (method, value) => {
      const { expenseWith } = await setup();
      const insert = await expenseWith(method);

      await insert({ value });
    });

    it.each([
      ["equal", 1n],
      ["percentage", null],
      ["percentage", 0n],
      ["percentage", 10_001n],
      ["shares", null],
      ["shares", 0n],
      ["exact", null],
      ["exact", -1n],
      ["adjustment", null],
    ])("rejects a %s participant with value %s", async (method, value) => {
      const { expenseWith } = await setup();
      const insert = await expenseWith(method);

      await expectViolation(
        insert({ value }),
        "expense_allocation_participants_value"
      );
    });

    it("rejects a method other than the expense's", async () => {
      const { child } = await setup();

      await expectViolation(
        db
          .insert(expenseAllocationParticipants)
          .values({ ...child, allocationMethod: "shares", value: 1n }),
        "expense_allocation_participants_method_fk"
      );
    });

    it("follows the expense's method, so stale inputs can't survive a change", async () => {
      const { expenseId } = await setup();

      await expectViolation(
        db
          .update(expenses)
          .set({ allocationMethod: "shares" })
          .where(eq(expenses.id, expenseId)),
        "expense_allocation_participants_value"
      );
    });
  });
});
