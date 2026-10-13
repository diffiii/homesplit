import {
  CreateExpenseCategoryRequest,
  type ExpenseCategory,
  type ExpenseCategoryListResponse,
  endpoints,
  Id,
  UpdateExpenseCategoryRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { PatchPipe } from "@/http/patch.pipe";
import { ZodPipe } from "@/http/zod.pipe";
import { CategoriesService } from "./categories.service";

@Controller()
export class CategoriesController {
  private readonly categories: CategoriesService;

  constructor(@Inject(CategoriesService) categories: CategoriesService) {
    this.categories = categories;
  }

  @HouseholdRoute(endpoints.listExpenseCategories)
  listExpenseCategories(
    @CurrentHousehold() household: HouseholdContext
  ): Promise<ExpenseCategoryListResponse> {
    return this.categories.list(household.householdId);
  }

  @HouseholdRoute(endpoints.createExpenseCategory, {
    minRole: "admin",
    module: "expenses",
  })
  createExpenseCategory(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(CreateExpenseCategoryRequest))
    body: CreateExpenseCategoryRequest
  ): Promise<ExpenseCategory> {
    return this.categories.create(household.householdId, body);
  }

  @HouseholdRoute(endpoints.updateExpenseCategory, {
    minRole: "admin",
    module: "expenses",
  })
  updateExpenseCategory(
    @CurrentHousehold() household: HouseholdContext,
    @Param("categoryId", new ZodPipe(Id)) categoryId: Id,
    @Body(new PatchPipe(UpdateExpenseCategoryRequest))
    body: UpdateExpenseCategoryRequest
  ): Promise<ExpenseCategory> {
    return this.categories.update(household.householdId, categoryId, body);
  }

  @HouseholdRoute(endpoints.deleteExpenseCategory, {
    minRole: "admin",
    module: "expenses",
  })
  async deleteExpenseCategory(
    @CurrentHousehold() household: HouseholdContext,
    @Param("categoryId", new ZodPipe(Id)) categoryId: Id
  ): Promise<void> {
    await this.categories.delete(household.householdId, categoryId);
  }
}
