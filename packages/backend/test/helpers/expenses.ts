import type { Executor } from "@/db";
import {
  expenseAllocationParticipants,
  expensePayers,
  expenseSplits,
  expenses,
} from "@/db/schema";

export interface StoredExpense {
  authorId: string;
  categoryId?: string | null;
  createdAt?: Date;
  expenseDate?: string;
  householdId: string;
  id?: string;
}

/**
 * Writes a complete expense straight to the database: the author pays all of
 * it and is its only participant, split equally. Returns its ID.
 */
export async function insertExpense(
  executor: Executor,
  {
    authorId,
    categoryId = null,
    createdAt,
    expenseDate = "2026-01-15",
    householdId,
    id: expenseId,
  }: StoredExpense
): Promise<string> {
  const amountCents = 1000n;
  const [{ id }] = await executor
    .insert(expenses)
    .values({
      id: expenseId,
      householdId,
      name: "Groceries",
      totalAmountCents: amountCents,
      currency: "PLN",
      allocationMethod: "equal",
      authorId,
      categoryId,
      expenseDate,
      createdAt,
    })
    .returning({ id: expenses.id });
  const child = { expenseId: id, householdId, userId: authorId };
  await executor.insert(expensePayers).values({ ...child, amountCents });
  await executor
    .insert(expenseAllocationParticipants)
    .values({ ...child, allocationMethod: "equal" });
  await executor.insert(expenseSplits).values({ ...child, amountCents });
  return id;
}
