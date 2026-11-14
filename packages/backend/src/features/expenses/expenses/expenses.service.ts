import type {
  CreateExpenseRequest,
  Expense,
  ExpenseFinancialSpec,
  ExpenseListResponse,
  ListExpensesQuery,
  UpdateExpenseRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { db, type Executor, readSnapshot, type Transaction } from "@/db";
import { expenses, receipts } from "@/db/schema";
import { assertCategoryInHousehold } from "@/features/expense-categories/category-reference";
import { lockHouseholdForLedgerWrite } from "@/features/expenses/household-ledger-lock";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import {
  assertUsersEligible,
  type UserReference,
} from "@/features/households/access/household-access";
import { hasRole } from "@/features/households/access/roles";
import { forbidden, notFound } from "@/http/app-error";
import {
  expenseInHousehold,
  expensesMatching,
  findExpenses,
  insertAggregate,
  lockExpense,
  updateAggregate,
} from "./expenses.repository";

export async function findExpense(
  executor: Executor,
  householdId: string,
  expenseId: string
): Promise<Expense> {
  const [expense] = await findExpenses(
    executor,
    expenseInHousehold(householdId, expenseId)
  );
  if (!expense) {
    throw notFound();
  }
  return expense;
}

/** The spec's payers and participants, at their paths under `prefix`. */
const userRefs = (
  { payers, allocation }: ExpenseFinancialSpec,
  prefix: string[] = []
): UserReference[] => [
  ...payers.map(({ userId }, index) => ({
    userId,
    path: [...prefix, "payers", index, "userId"],
  })),
  ...allocation.participants.map(({ userId }, index) => ({
    userId,
    path: [...prefix, "allocation", "participants", index, "userId"],
  })),
];

/**
 * Locks the expense `FOR UPDATE`, so writes to it run one after another, each
 * on what the previous one committed. Only its author or an admin+ may write.
 */
export async function lockExpenseForWrite(
  tx: Transaction,
  { householdId, role, userId }: HouseholdContext,
  expenseId: string
): Promise<void> {
  const row = await lockExpense(tx, householdId, expenseId);
  if (!row) {
    throw notFound();
  }
  if (row.authorId !== userId && !hasRole(role, "admin")) {
    throw forbidden();
  }
}

/**
 * Creates an expense inside `tx`, as `POST /expenses` does, and returns its
 * ID. The author is the caller; payers and participants must be current
 * members, and the splits are calculated here.
 */
export async function createExpense(
  tx: Transaction,
  { householdId, userId }: HouseholdContext,
  body: CreateExpenseRequest
): Promise<string> {
  await lockHouseholdForLedgerWrite(tx, householdId);
  await assertUsersEligible(tx, householdId, userRefs(body), "current");
  if (body.categoryId) {
    await assertCategoryInHousehold(tx, householdId, body.categoryId);
  }
  return insertAggregate(tx, householdId, userId, body);
}

@Injectable()
export class ExpensesService {
  list(
    householdId: string,
    { page, pageSize, ...filters }: ListExpensesQuery
  ): Promise<ExpenseListResponse> {
    return readSnapshot(async (tx) => {
      const where = expensesMatching(tx, householdId, filters);
      const items = await findExpenses(tx, where, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const totalItems = await tx.$count(expenses, where);
      return { items, page, pageSize, totalItems };
    });
  }

  /**
   * The author is the caller. Payers and participants must be current
   * members; the splits are calculated here, never taken from the client.
   */
  create(
    household: HouseholdContext,
    body: CreateExpenseRequest
  ): Promise<Expense> {
    return db.transaction(async (tx) => {
      const id = await createExpense(tx, household, body);
      return findExpense(tx, household.householdId, id);
    });
  }

  /** Another household's expense answers 404, the same as a missing one. */
  get(householdId: string, expenseId: string): Promise<Expense> {
    return findExpense(db, householdId, expenseId);
  }

  /**
   * Patches the descriptive fields, and with `financial` replaces the total,
   * payers, allocation, and splits together. Users already on the expense may
   * stay in either role after leaving; anyone else must be a current member.
   * A financial replacement unlinks the receipt the expense was made from,
   * which stays `confirmed` with its assignments as the record of the scan.
   */
  update(
    household: HouseholdContext,
    expenseId: string,
    patch: UpdateExpenseRequest
  ): Promise<Expense> {
    const { householdId } = household;
    return db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      await lockExpenseForWrite(tx, household, expenseId);

      if (patch.financial) {
        // Read after the lock, so it includes a replacement that committed
        // while this one waited.
        const stored = await findExpense(tx, householdId, expenseId);
        const onExpense = new Set([
          ...stored.payers.map((payer) => payer.user.id),
          ...stored.allocation.participants.map((p) => p.userId),
        ]);
        const newcomers = userRefs(patch.financial, ["financial"]).filter(
          (ref) => !onExpense.has(ref.userId)
        );
        await assertUsersEligible(tx, householdId, newcomers, "current");
      }
      if (patch.categoryId) {
        await assertCategoryInHousehold(tx, householdId, patch.categoryId);
      }

      await updateAggregate(tx, householdId, expenseId, patch);
      if (patch.financial) {
        await tx
          .update(receipts)
          .set({ expenseId: null, updatedAt: sql`now()` })
          .where(eq(receipts.expenseId, expenseId));
      }
      return findExpense(tx, householdId, expenseId);
    });
  }

  /**
   * Deletes the expense; its child rows cascade in the same statement. A
   * receipt still linked to it goes back to `ready`, with its items and
   * assignments, so it can be confirmed again.
   */
  async delete(household: HouseholdContext, expenseId: string): Promise<void> {
    const { householdId } = household;
    await db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      await lockExpenseForWrite(tx, household, expenseId);
      await tx
        .update(receipts)
        .set({ status: "ready", expenseId: null, updatedAt: sql`now()` })
        .where(eq(receipts.expenseId, expenseId));
      await tx
        .delete(expenses)
        .where(expenseInHousehold(householdId, expenseId));
    });
  }
}
