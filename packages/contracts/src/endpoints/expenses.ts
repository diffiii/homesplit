import {
  BalanceListResponse,
  ConfirmedSettlement,
  CreateExpenseCategoryRequest,
  CreateExpenseRequest,
  Expense,
  ExpenseCategory,
  ExpenseCategoryIdParams,
  ExpenseCategoryListResponse,
  ExpenseIdParams,
  ExpenseListResponse,
  ListExpensesQuery,
  ListSettlementHistoryQuery,
  ProcessSettlementRequest,
  Settlement,
  SettlementIdParams,
  SettlementListResponse,
  SettlementSuggestionListResponse,
  UpdateExpenseCategoryRequest,
  UpdateExpenseRequest,
} from "../features/expenses";
import { HouseholdIdParams } from "../features/households";
import type { Endpoint } from "./endpoint";
import { HOUSEHOLD } from "./paths";

const CATEGORY = `${HOUSEHOLD}/expense-categories/:categoryId`;
const EXPENSE = `${HOUSEHOLD}/expenses/:expenseId`;
const SETTLEMENT = `${HOUSEHOLD}/settlements/:settlementId`;

export const expenseEndpoints = {
  listExpenseCategories: {
    method: "GET",
    path: `${HOUSEHOLD}/expense-categories`,
    params: HouseholdIdParams,
    status: 200,
    response: ExpenseCategoryListResponse,
  },
  createExpenseCategory: {
    method: "POST",
    path: `${HOUSEHOLD}/expense-categories`,
    params: HouseholdIdParams,
    body: CreateExpenseCategoryRequest,
    status: 201,
    response: ExpenseCategory,
  },
  updateExpenseCategory: {
    method: "PATCH",
    path: CATEGORY,
    params: ExpenseCategoryIdParams,
    body: UpdateExpenseCategoryRequest,
    status: 200,
    response: ExpenseCategory,
  },
  deleteExpenseCategory: {
    method: "DELETE",
    path: CATEGORY,
    params: ExpenseCategoryIdParams,
    status: 204,
    response: null,
  },

  listExpenses: {
    method: "GET",
    path: `${HOUSEHOLD}/expenses`,
    params: HouseholdIdParams,
    query: ListExpensesQuery,
    status: 200,
    response: ExpenseListResponse,
  },
  createExpense: {
    method: "POST",
    path: `${HOUSEHOLD}/expenses`,
    params: HouseholdIdParams,
    body: CreateExpenseRequest,
    status: 201,
    response: Expense,
  },
  getExpense: {
    method: "GET",
    path: EXPENSE,
    params: ExpenseIdParams,
    status: 200,
    response: Expense,
  },
  updateExpense: {
    method: "PATCH",
    path: EXPENSE,
    params: ExpenseIdParams,
    body: UpdateExpenseRequest,
    status: 200,
    response: Expense,
  },
  deleteExpense: {
    method: "DELETE",
    path: EXPENSE,
    params: ExpenseIdParams,
    status: 204,
    response: null,
  },

  listSettlements: {
    method: "GET",
    path: `${HOUSEHOLD}/settlements`,
    params: HouseholdIdParams,
    query: ListSettlementHistoryQuery,
    status: 200,
    response: SettlementListResponse,
  },
  processSettlement: {
    method: "POST",
    path: `${HOUSEHOLD}/settlements`,
    params: HouseholdIdParams,
    body: ProcessSettlementRequest,
    status: 201,
    response: Settlement,
  },
  deleteSettlement: {
    method: "DELETE",
    path: SETTLEMENT,
    params: SettlementIdParams,
    status: 204,
    response: null,
  },
  confirmSettlement: {
    method: "POST",
    path: `${SETTLEMENT}/confirm`,
    params: SettlementIdParams,
    status: 200,
    response: ConfirmedSettlement,
  },
  listBalances: {
    method: "GET",
    path: `${HOUSEHOLD}/balances`,
    params: HouseholdIdParams,
    status: 200,
    response: BalanceListResponse,
  },
  listSettlementSuggestions: {
    method: "GET",
    path: `${HOUSEHOLD}/settlement-suggestions`,
    params: HouseholdIdParams,
    status: 200,
    response: SettlementSuggestionListResponse,
  },
} as const satisfies Record<string, Endpoint>;
