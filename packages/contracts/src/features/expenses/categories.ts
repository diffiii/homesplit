import { z } from "zod";

import { Emoji } from "../../common/emoji";
import { Id } from "../../common/id";

/** Household-scoped expense category if needed - could be used for budget tracking */
export const ExpenseCategory = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  /** Shown as the category's avatar. */
  icon: Emoji.nullable(),
});
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

const ExpenseCategoryWritableFields = z.object({
  name: z.string().min(1),
  icon: Emoji.nullable().optional(),
});

/** Create an expense category. */
export const CreateExpenseCategoryRequest = ExpenseCategoryWritableFields;
export type CreateExpenseCategoryRequest = z.infer<
  typeof CreateExpenseCategoryRequest
>;

/** Partial update of writable category fields. */
export const UpdateExpenseCategoryRequest =
  ExpenseCategoryWritableFields.partial();
export type UpdateExpenseCategoryRequest = z.infer<
  typeof UpdateExpenseCategoryRequest
>;

/**
 * Path params for category-scoped routes (update / delete).
 */
export const ExpenseCategoryIdParams = z.object({
  householdId: Id,
  categoryId: Id,
});
export type ExpenseCategoryIdParams = z.infer<typeof ExpenseCategoryIdParams>;

/** Unpaginated category list (small set per household). */
export const ExpenseCategoryListResponse = z.object({
  items: z.array(ExpenseCategory),
});
export type ExpenseCategoryListResponse = z.infer<
  typeof ExpenseCategoryListResponse
>;
