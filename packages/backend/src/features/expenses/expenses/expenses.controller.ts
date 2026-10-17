import {
  CreateExpenseRequest,
  type Expense,
  type ExpenseListResponse,
  endpoints,
  Id,
  ListExpensesQuery,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, Query } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { ZodPipe } from "@/http/zod.pipe";
import { ExpensesService } from "./expenses.service";

@Controller()
export class ExpensesController {
  private readonly expenses: ExpensesService;

  constructor(@Inject(ExpensesService) expenses: ExpensesService) {
    this.expenses = expenses;
  }

  @HouseholdRoute(endpoints.listExpenses)
  listExpenses(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(ListExpensesQuery)) query: ListExpensesQuery
  ): Promise<ExpenseListResponse> {
    return this.expenses.list(household.householdId, query);
  }

  @HouseholdRoute(endpoints.createExpense, { module: "expenses" })
  createExpense(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(CreateExpenseRequest)) body: CreateExpenseRequest
  ): Promise<Expense> {
    return this.expenses.create(household, body);
  }

  @HouseholdRoute(endpoints.getExpense)
  getExpense(
    @CurrentHousehold() household: HouseholdContext,
    @Param("expenseId", new ZodPipe(Id)) expenseId: Id
  ): Promise<Expense> {
    return this.expenses.get(household.householdId, expenseId);
  }
}
