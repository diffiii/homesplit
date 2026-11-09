import {
  CreateExpenseCategoryRequest,
  type ExpenseCategory,
  type ExpenseCategoryListResponse,
  type ExpenseCategorySuggestion,
  endpoints,
  Id,
  SuggestExpenseCategoryRequest,
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
import { CategorySuggestionsService } from "./category-suggestions.service";
import { ExpenseCategoriesService } from "./expense-categories.service";

@Controller()
export class ExpenseCategoriesController {
  private readonly categories: ExpenseCategoriesService;
  private readonly suggestions: CategorySuggestionsService;

  constructor(
    @Inject(ExpenseCategoriesService) categories: ExpenseCategoriesService,
    @Inject(CategorySuggestionsService) suggestions: CategorySuggestionsService
  ) {
    this.categories = categories;
    this.suggestions = suggestions;
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

  /** `AiService` checks the `ai` module. */
  @HouseholdRoute(endpoints.suggestExpenseCategory, { module: "expenses" })
  suggestExpenseCategory(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(SuggestExpenseCategoryRequest))
    body: SuggestExpenseCategoryRequest
  ): Promise<ExpenseCategorySuggestion> {
    return this.suggestions.suggest(household.householdId, body);
  }
}
