import type {
  CreateExpenseCategoryRequest,
  ExpenseCategory,
  ExpenseCategoryListResponse,
  UpdateExpenseCategoryRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { AppError, notFound } from "@/http/app-error";

const inHousehold = (householdId: string, categoryId: string) =>
  and(
    eq(expenseCategories.id, categoryId),
    eq(expenseCategories.householdId, householdId)
  );

@Injectable()
export class ExpenseCategoriesService {
  async list(householdId: string): Promise<ExpenseCategoryListResponse> {
    const items = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.householdId, householdId))
      .orderBy(
        asc(sql`lower(${expenseCategories.name})`),
        asc(expenseCategories.id)
      );
    return { items };
  }

  async create(
    householdId: string,
    { name, icon = null }: CreateExpenseCategoryRequest
  ): Promise<ExpenseCategory> {
    const [row] = await db
      .insert(expenseCategories)
      .values({ householdId, name, icon })
      .returning();
    return row;
  }

  async update(
    householdId: string,
    categoryId: string,
    patch: UpdateExpenseCategoryRequest
  ): Promise<ExpenseCategory> {
    const [row] = await db
      .update(expenseCategories)
      .set(patch)
      .where(inHousehold(householdId, categoryId))
      .returning();
    if (!row) {
      throw notFound();
    }
    return row;
  }

  /**
   * Refuses while any expense uses the category. An expense committed after
   * the check makes `expenses_category_fk` reject the delete, which answers
   * the generic 409 `CONFLICT`.
   */
  async delete(householdId: string, categoryId: string): Promise<void> {
    const [used] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.householdId, householdId),
          eq(expenses.categoryId, categoryId)
        )
      )
      .limit(1);
    if (used) {
      throw new AppError(
        409,
        "CATEGORY_IN_USE",
        "An expense uses this category"
      );
    }

    const deleted = await db
      .delete(expenseCategories)
      .where(inHousehold(householdId, categoryId))
      .returning({ id: expenseCategories.id });
    if (deleted.length === 0) {
      throw notFound();
    }
  }
}
