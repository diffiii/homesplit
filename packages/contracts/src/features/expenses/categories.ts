import { z } from "zod";

import { Id } from "../../common/id";

/** Household-scoped expense category if needed - could be used for budget tracking */
export const ExpenseCategory = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  icon: z.string().min(1).nullable(),
});
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

const ExpenseCategoryWritableFields = z.object({
  name: z.string().min(1),
  icon: z.string().min(1).nullable().optional(),
});

/** Create an expense category. */
export const CreateExpenseCategoryRequest = ExpenseCategoryWritableFields;

/** Partial update of writable category fields. */
export const UpdateExpenseCategoryRequest =
  ExpenseCategoryWritableFields.partial();

/**
 * Path params for category-scoped routes (update / delete).
 */
export const ExpenseCategoryIdParams = z.object({
  householdId: Id,
  categoryId: Id,
});
export type ExpenseCategoryIdParams = z.infer<typeof ExpenseCategoryIdParams>;

/** Path params for listing categories in a household. */
export const ListExpenseCategoriesParams = z.object({
  householdId: Id,
});
export type ListExpenseCategoriesParams = z.infer<
  typeof ListExpenseCategoriesParams
>;

/** Unpaginated category list (small set per household). */
export const ExpenseCategoryListResponse = z.object({
  items: z.array(ExpenseCategory),
});
export type ExpenseCategoryListResponse = z.infer<
  typeof ExpenseCategoryListResponse
>;
