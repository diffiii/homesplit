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

/** How sure the model is of a suggested category. */
export const CATEGORY_SUGGESTION_CONFIDENCES = [
  "low",
  "medium",
  "high",
] as const;

export const CategorySuggestionConfidence = z.enum(
  CATEGORY_SUGGESTION_CONFIDENCES
);
export type CategorySuggestionConfidence = z.infer<
  typeof CategorySuggestionConfidence
>;

/**
 * What to suggest a category for: an expense's name, description, one of the
 * household's attachments (an image or PDF, such as a receipt), or any
 * combination, with at least one of them. `null` is the same as omitted, so
 * the expense form's values can be sent as they are.
 */
export const SuggestExpenseCategoryRequest = z
  .strictObject({
    name: z.string().min(1).nullable().optional(),
    description: z.string().min(1).nullable().optional(),
    attachmentId: Id.nullable().optional(),
  })
  .refine(
    ({ name, description, attachmentId }) =>
      (name ?? description ?? attachmentId ?? null) !== null,
    "Send a name, a description, or an attachment"
  );
export type SuggestExpenseCategoryRequest = z.infer<
  typeof SuggestExpenseCategoryRequest
>;

/**
 * One of the household's own categories, or `suggestion: null` when none
 * fits. Nothing is saved. Clients prefill the category field only when
 * `confidence` is `"high"` and the member hasn't picked a category yet; any
 * other suggestion may be offered as a hint, never applied on its own.
 */
export const ExpenseCategorySuggestion = z.object({
  suggestion: z
    .object({
      categoryId: Id,
      confidence: CategorySuggestionConfidence,
    })
    .nullable(),
});
export type ExpenseCategorySuggestion = z.infer<
  typeof ExpenseCategorySuggestion
>;
