import {
  allocate,
  type CreateExpenseRequest,
  type Expense,
  type ExpenseListResponse,
  type ListExpensesQuery,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db, type Executor, readSnapshot } from "@/db";
import { expenses } from "@/db/schema";
import { assertCategoryInHousehold } from "@/features/expense-categories/category-reference";
import { lockHouseholdForLedgerWrite } from "@/features/expenses/household-ledger-lock";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { assertUsersEligible } from "@/features/households/access/household-access";
import { notFound } from "@/http/app-error";
import { findExpenses, insertAggregate } from "./expenses.repository";

async function findExpense(
  executor: Executor,
  householdId: string,
  expenseId: string
): Promise<Expense> {
  const [expense] = await findExpenses(
    executor,
    and(eq(expenses.id, expenseId), eq(expenses.householdId, householdId))
  );
  if (!expense) {
    throw notFound();
  }
  return expense;
}

@Injectable()
export class ExpensesService {
  list(
    householdId: string,
    { page, pageSize }: ListExpensesQuery
  ): Promise<ExpenseListResponse> {
    return readSnapshot(async (tx) => {
      const items = await findExpenses(
        tx,
        eq(expenses.householdId, householdId),
        { limit: pageSize, offset: (page - 1) * pageSize }
      );
      const totalItems = await tx.$count(
        expenses,
        eq(expenses.householdId, householdId)
      );
      return { items, page, pageSize, totalItems };
    });
  }

  /**
   * The author is the caller. Payers and participants must be current
   * members; the splits are calculated here, never taken from the client.
   */
  create(
    { householdId, userId }: HouseholdContext,
    body: CreateExpenseRequest
  ): Promise<Expense> {
    return db.transaction(async (tx) => {
      await lockHouseholdForLedgerWrite(tx, householdId);
      await assertUsersEligible(
        tx,
        householdId,
        [
          ...body.payers.map((payer, index) => ({
            userId: payer.userId,
            path: ["payers", index, "userId"],
          })),
          ...body.allocation.participants.map((participant, index) => ({
            userId: participant.userId,
            path: ["allocation", "participants", index, "userId"],
          })),
        ],
        "current"
      );
      if (body.categoryId) {
        await assertCategoryInHousehold(tx, householdId, body.categoryId);
      }

      const splits = allocate(body.total.amountCents, body.allocation);
      const id = await insertAggregate(tx, householdId, userId, body, splits);
      return findExpense(tx, householdId, id);
    });
  }

  /** Another household's expense answers 404, the same as a missing one. */
  get(householdId: string, expenseId: string): Promise<Expense> {
    return findExpense(db, householdId, expenseId);
  }
}
