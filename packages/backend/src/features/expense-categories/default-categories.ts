import type { CreateExpenseCategoryRequest } from "@homesplit/contracts";
import type { Executor } from "@/db";
import { expenseCategories } from "@/db/schema";

/** What a new household starts with; members can rename or delete them. */
export const DEFAULT_CATEGORIES = [
  { name: "Groceries", icon: "🛒" },
  { name: "Utilities", icon: "💡" },
  { name: "Rent", icon: "🏠" },
  { name: "Transport", icon: "🚗" },
  { name: "Dining out", icon: "🍽️" },
  { name: "Entertainment", icon: "🎬" },
  { name: "Other", icon: "📦" },
] as const satisfies readonly CreateExpenseCategoryRequest[];

export async function seedDefaultCategories(
  executor: Executor,
  householdId: string
): Promise<void> {
  await executor
    .insert(expenseCategories)
    .values(
      DEFAULT_CATEGORIES.map((category) => ({ ...category, householdId }))
    );
}
