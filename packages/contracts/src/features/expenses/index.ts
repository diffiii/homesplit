import { z } from "zod";

import { IsoDate, IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Money } from "../../common/money";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { UserSummary } from "../users";

/** How an expense total is divided among participants. */
export const SplitMethod = z.enum([
  "equal",
  "percentage",
  "shares",
  "exact",
  "adjustment",
]);
export type SplitMethod = z.infer<typeof SplitMethod>;

/** One participant's share of an expense. */
export const ExpenseSplit = z.object({
  id: Id,
  user: UserSummary,
  amount: Money,
  // isSettled: z.boolean(),            // I think we can remove this field, because algorithm will be way more complex if we want to keep it
  // settledAt: IsoDateTime.nullable(), // Same as above
});
export type ExpenseSplit = z.infer<typeof ExpenseSplit>;

/** Household expense with payer, author, and splits. */
export const Expense = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  total: Money,
  splitMethod: SplitMethod,
  payer: UserSummary, // if we want to be able to put more than one payer, we should consider payers ExpenseSplit or sth like that
  author: UserSummary,
  expenseDate: IsoDate,
  splits: z.array(ExpenseSplit),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Expense = z.infer<typeof Expense>;

/** Split line when creating or updating an expense (currency from `total`). */
export const ExpenseSplitInput = z.object({
  userId: Id,
  amountCents: z.int(),
});
export type ExpenseSplitInput = z.infer<typeof ExpenseSplitInput>;

const ExpenseWritableFields = z.object({
  name: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  total: Money,
  splitMethod: SplitMethod,
  payerId: Id,
  expenseDate: IsoDate,
  splits: z.array(ExpenseSplitInput).min(1),
});

/** Create an expense; author is the authenticated user. */
export const CreateExpenseRequest = ExpenseWritableFields;

/** Partial update of writable fields only (not settlement state). */
export const UpdateExpenseRequest = ExpenseWritableFields.partial();

/** List expenses with offset pagination. */
export const ListExpensesQuery = Pagination;
export type ListExpensesQuery = z.infer<typeof ListExpensesQuery>;

/** Paginated expense response list. */
export const ExpenseListResponse = paginatedResponse(Expense);
export type ExpenseListResponse = z.infer<typeof ExpenseListResponse>;

/**
 * Path params for expense-scoped routes (get / update / delete).
 */
export const ExpenseIdParams = z.object({
  householdId: Id,
  expenseId: Id,
});
export type ExpenseIdParams = z.infer<typeof ExpenseIdParams>;

/** Response for fetching a single expense by id. */
export type GetExpenseResponse = Expense;
