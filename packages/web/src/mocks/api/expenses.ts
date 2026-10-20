import {
  allocate,
  type ConfirmedSettlement,
  type Expense,
  type ExpenseAllocationInput,
  type ExpensePayerInput,
  type Settlement,
} from "@homesplit/contracts";
import { type MockDb, type MockExpense, type MockSettlement, now } from "../db";
import { conflict, forbidden, invalidReference } from "../errors";
import { hasRole, type MockRoutes } from "../routes";
import { listBalances, suggestSettlements } from "./ledger";
import {
  asc,
  assertCurrentMembers,
  definedFields,
  desc,
  findInHousehold,
  paginate,
  removeRow,
  sortBy,
} from "./shared";

const byUser = asc((row: { userId: string }) => row.userId);

/** Child rows come back sorted by user ID, and splits are calculated on read. */
export function renderExpense(db: MockDb, expense: MockExpense): Expense {
  const { allocation } = expense;
  return {
    id: expense.id,
    householdId: expense.householdId,
    name: expense.name,
    description: expense.description,
    total: expense.total,
    payers: sortBy(expense.payers, byUser).map(({ userId, amountCents }) => ({
      user: db.summary(userId),
      amountCents,
    })),
    author: db.summary(expense.authorId),
    category:
      db.state.categories.find(({ id }) => id === expense.categoryId) ?? null,
    expenseDate: expense.expenseDate,
    allocation: {
      ...allocation,
      participants: sortBy(allocation.participants, byUser),
    } as ExpenseAllocationInput,
    splits: sortBy(allocate(expense.total.amountCents, allocation), byUser).map(
      ({ userId, amountCents }) => ({ user: db.summary(userId), amountCents })
    ),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

export function renderSettlement(
  db: MockDb,
  settlement: MockSettlement
): Settlement {
  const base = {
    id: settlement.id,
    householdId: settlement.householdId,
    payer: db.summary(settlement.payerId),
    payee: db.summary(settlement.payeeId),
    createdBy: db.summary(settlement.createdById),
    amount: settlement.amount,
    note: settlement.note,
    createdAt: settlement.createdAt,
  };
  if (settlement.confirmedById && settlement.confirmedAt) {
    return {
      ...base,
      status: "confirmed",
      confirmedBy: db.summary(settlement.confirmedById),
      confirmedAt: settlement.confirmedAt,
    };
  }
  return { ...base, status: "pending", confirmedBy: null, confirmedAt: null };
}

function assertCategory(
  db: MockDb,
  householdId: string,
  categoryId: string | null | undefined
) {
  if (
    categoryId &&
    !db.state.categories.some(
      (category) =>
        category.id === categoryId && category.householdId === householdId
    )
  ) {
    throw invalidReference([
      { path: ["categoryId"], message: "Unknown category" },
    ]);
  }
}

/** Payers and participants at their paths under `prefix`, for `assertCurrentMembers`. */
function financialRefs(
  {
    payers,
    allocation,
  }: { payers: ExpensePayerInput[]; allocation: ExpenseAllocationInput },
  prefix: string[] = []
) {
  return [
    ...payers.map(({ userId }, i) => ({
      userId,
      path: [...prefix, "payers", i, "userId"],
    })),
    ...allocation.participants.map(({ userId }, i) => ({
      userId,
      path: [...prefix, "allocation", "participants", i, "userId"],
    })),
  ];
}

function assertAuthorOrAdmin(
  expense: MockExpense,
  userId: string,
  role: Parameters<typeof hasRole>[0]
) {
  if (expense.authorId !== userId && !hasRole(role, "admin")) {
    throw forbidden();
  }
}

const isParty = (settlement: MockSettlement, userId: string) =>
  settlement.payerId === userId || settlement.payeeId === userId;

export const expenseRoutes: MockRoutes = {
  listExpenseCategories: {
    resolve: ({ db, household }) => ({
      items: sortBy(
        db.state.categories.filter(
          ({ householdId }) => householdId === household.id
        ),
        asc((category) => category.name.toLowerCase()),
        asc((category) => category.id)
      ),
    }),
  },

  createExpenseCategory: {
    module: "expenses",
    minRole: "admin",
    resolve: ({ db, household, body }) => {
      const category = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name: body.name,
        icon: body.icon ?? null,
      };
      db.state.categories.push(category);
      return category;
    },
  },

  updateExpenseCategory: {
    module: "expenses",
    minRole: "admin",
    resolve: ({ db, household, params, body }) => {
      const category = findInHousehold(
        db.state.categories,
        household.id,
        params.categoryId
      );
      Object.assign(category, definedFields(body));
      return category;
    },
  },

  deleteExpenseCategory: {
    module: "expenses",
    minRole: "admin",
    resolve: ({ db, household, params }) => {
      const category = findInHousehold(
        db.state.categories,
        household.id,
        params.categoryId
      );
      if (
        db.state.expenses.some(({ categoryId }) => categoryId === category.id)
      ) {
        throw conflict("CATEGORY_IN_USE", "An expense uses this category");
      }
      removeRow(db.state.categories, category);
    },
  },

  listExpenses: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          db.state.expenses.filter(
            ({ householdId }) => householdId === household.id
          ),
          desc((expense) => expense.expenseDate),
          desc((expense) => expense.createdAt),
          desc((expense) => expense.id)
        ),
        query,
        (expense) => renderExpense(db, expense)
      ),
  },

  createExpense: {
    module: "expenses",
    resolve: ({ db, household, userId, body }) => {
      assertCurrentMembers(db, household.id, financialRefs(body));
      assertCategory(db, household.id, body.categoryId);
      const time = now();
      const expense: MockExpense = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name: body.name,
        description: body.description ?? null,
        total: body.total,
        payers: body.payers,
        authorId: userId,
        categoryId: body.categoryId ?? null,
        expenseDate: body.expenseDate,
        allocation: body.allocation,
        createdAt: time,
        updatedAt: time,
      };
      db.state.expenses.push(expense);
      return renderExpense(db, expense);
    },
  },

  getExpense: {
    resolve: ({ db, household, params }) =>
      renderExpense(
        db,
        findInHousehold(db.state.expenses, household.id, params.expenseId)
      ),
  },

  updateExpense: {
    module: "expenses",
    resolve: ({ db, household, member, userId, params, body }) => {
      const expense = findInHousehold(
        db.state.expenses,
        household.id,
        params.expenseId
      );
      assertAuthorOrAdmin(expense, userId, member.role);
      const { financial, ...descriptive } = body;
      if (financial) {
        // Anyone already on the expense may stay, even after leaving.
        const onExpense = new Set(
          financialRefs(expense).map(({ userId: id }) => id)
        );
        assertCurrentMembers(
          db,
          household.id,
          financialRefs(financial, ["financial"]).filter(
            ({ userId: id }) => !onExpense.has(id)
          )
        );
      }
      assertCategory(db, household.id, descriptive.categoryId);
      Object.assign(expense, definedFields(descriptive), {
        ...(financial && {
          total: financial.total,
          payers: financial.payers,
          allocation: financial.allocation,
        }),
        updatedAt: now(),
      });
      return renderExpense(db, expense);
    },
  },

  deleteExpense: {
    module: "expenses",
    resolve: ({ db, household, member, userId, params }) => {
      const expense = findInHousehold(
        db.state.expenses,
        household.id,
        params.expenseId
      );
      assertAuthorOrAdmin(expense, userId, member.role);
      removeRow(db.state.expenses, expense);
    },
  },

  listSettlements: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          db.state.settlements.filter(
            ({ householdId }) => householdId === household.id
          ),
          desc((settlement) => settlement.createdAt),
          desc((settlement) => settlement.id)
        ),
        query,
        (settlement) => renderSettlement(db, settlement)
      ),
  },

  processSettlement: {
    module: "expenses",
    resolve: ({ db, household, member, userId, body }) => {
      const recorderIsParty =
        userId === body.payerId || userId === body.payeeId;
      if (!(recorderIsParty || hasRole(member.role, "admin"))) {
        throw forbidden();
      }
      const issues = (["payerId", "payeeId"] as const)
        .filter((field) => !db.isParty(household.id, body[field]))
        .map((field) => ({
          path: [field],
          message: "Not a household party",
        }));
      if (issues.length > 0) {
        throw invalidReference(issues);
      }
      const time = now();
      // A payment recorded by its payer waits for the payee to confirm it.
      const confirmed = userId !== body.payerId;
      const settlement: MockSettlement = {
        id: crypto.randomUUID(),
        householdId: household.id,
        payerId: body.payerId,
        payeeId: body.payeeId,
        createdById: userId,
        amount: body.amount,
        note: body.note ?? null,
        createdAt: time,
        confirmedById: confirmed ? userId : null,
        confirmedAt: confirmed ? time : null,
      };
      db.state.settlements.push(settlement);
      return renderSettlement(db, settlement);
    },
  },

  deleteSettlement: {
    module: "expenses",
    resolve: ({ db, household, member, userId, params }) => {
      const settlement = findInHousehold(
        db.state.settlements,
        household.id,
        params.settlementId
      );
      if (!(isParty(settlement, userId) || hasRole(member.role, "admin"))) {
        throw forbidden();
      }
      if (settlement.confirmedAt) {
        throw conflict(
          "SETTLEMENT_CONFIRMED",
          "A confirmed payment can't be deleted"
        );
      }
      removeRow(db.state.settlements, settlement);
    },
  },

  confirmSettlement: {
    module: "expenses",
    resolve: ({ db, household, member, userId, params }) => {
      const settlement = findInHousehold(
        db.state.settlements,
        household.id,
        params.settlementId
      );
      const canConfirm =
        settlement.payeeId === userId ||
        (hasRole(member.role, "admin") && settlement.payerId !== userId);
      if (!canConfirm) {
        throw forbidden();
      }
      // Idempotent: a repeat keeps the original confirmation.
      if (!settlement.confirmedAt) {
        settlement.confirmedById = userId;
        settlement.confirmedAt = now();
      }
      return renderSettlement(db, settlement) as ConfirmedSettlement;
    },
  },

  listBalances: {
    resolve: ({ db, household }) => listBalances(db, household.id),
  },

  listSettlementSuggestions: {
    resolve: ({ db, household }) => suggestSettlements(db, household.id),
  },
};
