import {
  allocate,
  type CreateExpenseRequest,
  type Expense,
  ExpenseAllocationInput,
  type ExpenseFinancialSpec,
  type SplitMethod,
  toSafeInteger,
  type UpdateExpenseRequest,
  type UserSummary,
} from "@homesplit/contracts";
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import type { Executor, Transaction } from "@/db";
import {
  expenseAllocationParticipants,
  expensePayers,
  expenseSplits,
  expenses,
} from "@/db/schema";

/** The participant field that `value` stores, by method; `equal` has none. */
const valueFields = {
  equal: null,
  percentage: "basisPoints",
  shares: "shares",
  exact: "amountCents",
  adjustment: "adjustmentCents",
} as const satisfies Record<SplitMethod, string | null>;

type ValueField = NonNullable<(typeof valueFields)[SplitMethod]>;

/** Any method's participant, read through `valueFields`. */
type ParticipantInput = { userId: string } & Partial<
  Record<ValueField, number>
>;

/** One expense, only if it's in the household. */
export const expenseInHousehold = (householdId: string, expenseId: string) =>
  and(eq(expenses.id, expenseId), eq(expenses.householdId, householdId));

/**
 * Writes an expense's payers, allocation participants, and the splits
 * `allocate` calculates from them. The expense row must already have
 * `allocation_method` set to `spec.allocation.method`.
 */
async function insertFinancialRows(
  tx: Transaction,
  householdId: string,
  expenseId: string,
  { total, payers, allocation }: ExpenseFinancialSpec
): Promise<void> {
  const child = { expenseId, householdId };
  const field = valueFields[allocation.method];
  await tx.insert(expensePayers).values(
    payers.map(({ userId, amountCents }) => ({
      ...child,
      userId,
      amountCents: BigInt(amountCents),
    }))
  );
  await tx.insert(expenseAllocationParticipants).values(
    allocation.participants.map((participant: ParticipantInput) => {
      // Stored as null when missing, which the table's check rejects for
      // every method but `equal`.
      const value = field === null ? undefined : participant[field];
      return {
        ...child,
        userId: participant.userId,
        allocationMethod: allocation.method,
        value: value === undefined ? null : BigInt(value),
      };
    })
  );
  await tx.insert(expenseSplits).values(
    allocate(total.amountCents, allocation).map(({ userId, amountCents }) => ({
      ...child,
      userId,
      amountCents: BigInt(amountCents),
    }))
  );
}

/** Writes a new expense with all its child rows and returns its ID. */
export async function insertAggregate(
  tx: Transaction,
  householdId: string,
  authorId: string,
  request: CreateExpenseRequest
): Promise<string> {
  const [{ id }] = await tx
    .insert(expenses)
    .values({
      householdId,
      authorId,
      name: request.name,
      description: request.description ?? null,
      categoryId: request.categoryId ?? null,
      expenseDate: request.expenseDate,
      totalAmountCents: BigInt(request.total.amountCents),
      currency: request.total.currency,
      allocationMethod: request.allocation.method,
    })
    .returning({ id: expenses.id });
  await insertFinancialRows(tx, householdId, id, request);
  return id;
}

/**
 * Locks the expense's row `FOR UPDATE` until the transaction ends, so writes
 * to it run one after another. Undefined when it isn't in the household.
 */
export async function lockExpense(
  tx: Transaction,
  householdId: string,
  expenseId: string
): Promise<{ authorId: string } | undefined> {
  const [row] = await tx
    .select({ authorId: expenses.authorId })
    .from(expenses)
    .where(expenseInHousehold(householdId, expenseId))
    .for("update");
  return row;
}

/**
 * Patches an expense's descriptive fields and, with `financial`, replaces its
 * total, payers, allocation participants, and splits as a whole. The caller
 * holds the expense's row lock.
 */
export async function updateAggregate(
  tx: Transaction,
  householdId: string,
  expenseId: string,
  { financial, ...descriptive }: UpdateExpenseRequest
): Promise<void> {
  if (financial) {
    // Before the method changes, which cascades to the old participants.
    await tx
      .delete(expensePayers)
      .where(eq(expensePayers.expenseId, expenseId));
    await tx
      .delete(expenseAllocationParticipants)
      .where(eq(expenseAllocationParticipants.expenseId, expenseId));
    await tx
      .delete(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId));
  }
  await tx
    .update(expenses)
    .set({
      ...descriptive,
      ...(financial && {
        totalAmountCents: BigInt(financial.total.amountCents),
        currency: financial.total.currency,
        allocationMethod: financial.allocation.method,
      }),
      // Taken after the row lock, unlike `now()`, so serialized edits get
      // increasing times.
      updatedAt: sql`statement_timestamp()`,
    })
    .where(expenseInHousehold(householdId, expenseId));
  if (financial) {
    await insertFinancialRows(tx, householdId, expenseId, financial);
  }
}

const userColumns = { columns: { id: true, name: true, image: true } } as const;

const toUserSummary = (row: {
  id: string;
  image: string | null;
  name: string;
}): UserSummary => ({ id: row.id, name: row.name, imageUrl: row.image });

/** A payer or a split: who, and how much. */
const toShare = (row: {
  amountCents: bigint;
  user: { id: string; image: string | null; name: string };
}) => ({
  user: toUserSummary(row.user),
  amountCents: toSafeInteger(row.amountCents),
});

/**
 * Reads the expenses matching `where` in the list order: `expense_date`,
 * `created_at`, and `id`, all descending. Child rows are sorted by `user_id`.
 * Everything comes back in one query.
 */
export async function findExpenses(
  executor: Executor,
  where: SQL | undefined,
  page?: { limit: number; offset: number }
): Promise<Expense[]> {
  const rows = await executor.query.expenses.findMany({
    where,
    orderBy: [
      desc(expenses.expenseDate),
      desc(expenses.createdAt),
      desc(expenses.id),
    ],
    ...page,
    with: {
      author: userColumns,
      category: true,
      payers: {
        columns: { amountCents: true },
        with: { user: userColumns },
        orderBy: [asc(expensePayers.userId)],
      },
      participants: {
        columns: { userId: true, value: true },
        orderBy: [asc(expenseAllocationParticipants.userId)],
      },
      splits: {
        columns: { amountCents: true },
        with: { user: userColumns },
        orderBy: [asc(expenseSplits.userId)],
      },
    },
  });

  return rows.map((row) => {
    const field = valueFields[row.allocationMethod as SplitMethod];
    return {
      id: row.id,
      householdId: row.householdId,
      name: row.name,
      description: row.description,
      total: {
        amountCents: toSafeInteger(row.totalAmountCents),
        currency: row.currency,
      },
      payers: row.payers.map(toShare),
      author: toUserSummary(row.author),
      category: row.category,
      expenseDate: row.expenseDate,
      // Parsed, so a stored row the contract can't describe fails loudly.
      allocation: ExpenseAllocationInput.parse({
        method: row.allocationMethod,
        participants: row.participants.map(({ userId, value }) =>
          field === null || value === null
            ? { userId }
            : { userId, [field]: toSafeInteger(value) }
        ),
      }),
      splits: row.splits.map(toShare),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
