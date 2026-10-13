import type {
  CreateExpenseCategoryRequest,
  ExpenseCategory,
  ExpenseCategoryListResponse,
  UpdateExpenseCategoryRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { notFound } from "@/http/app-error";

const inHousehold = (householdId: string, categoryId: string) =>
  and(
    eq(expenseCategories.id, categoryId),
    eq(expenseCategories.householdId, householdId)
  );

@Injectable()
export class CategoriesService {
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

  async delete(householdId: string, categoryId: string): Promise<void> {
    // TODO: #37 answer 409 CATEGORY_IN_USE while an expense uses the category
    const deleted = await db
      .delete(expenseCategories)
      .where(inHousehold(householdId, categoryId))
      .returning({ id: expenseCategories.id });
    if (deleted.length === 0) {
      throw notFound();
    }
  }
}
