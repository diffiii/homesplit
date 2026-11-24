import { and, eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { expenseCategories } from "@/db/schema";
import { invalidReference } from "@/http/app-error";

/**
 * Rejects a category that isn't this household's. A missing category and one
 * from another household get the same 400. `path` is where the ID appeared in
 * the request, for `details.issues`.
 */
export async function assertCategoryInHousehold(
  executor: Executor,
  householdId: string,
  categoryId: string,
  path: (string | number)[] = ["categoryId"]
): Promise<void> {
  const [row] = await executor
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.id, categoryId),
        eq(expenseCategories.householdId, householdId)
      )
    )
    .limit(1);
  if (!row) {
    throw invalidReference([{ path, message: "Unknown category" }]);
  }
}
