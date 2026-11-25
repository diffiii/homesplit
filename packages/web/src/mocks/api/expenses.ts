import {
  type AttachmentSummary,
  allocate,
  type ConfirmedSettlement,
  type Expense,
  type ExpenseAllocationInput,
  type ExpensePayerInput,
  type ListExpensesQuery,
  planWriteOff,
  type Settlement,
  UNCATEGORIZED,
  WRITE_OFF_NOTE,
} from "@homesplit/contracts";
import {
  type MockAttachment,
  type MockDb,
  type MockExpense,
  type MockSettlement,
  now,
} from "../db";
import {
  conflict,
  forbidden,
  invalidReference,
  MockApiError,
  notFound,
} from "../errors";
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

/** The backend's default `ATTACHMENT_MAX_PER_EXPENSE`. */
const ATTACHMENT_MAX_PER_EXPENSE = 10;

/** The files linked to an expense, in the order they were linked. */
function linkedAttachments(db: MockDb, expenseId: string): AttachmentSummary[] {
  return sortBy(
    db.state.expenseAttachments.filter((link) => link.expenseId === expenseId),
    asc((link) => link.createdAt),
    asc((link) => link.attachmentId)
  ).flatMap(({ attachmentId }) => {
    const attachment = db.state.attachments.find(
      ({ id }) => id === attachmentId
    );
    return attachment ? [toSummary(attachment)] : [];
  });
}

function toSummary({
  id,
  mimeType,
  sizeBytes,
  hasThumbnail,
}: MockAttachment): AttachmentSummary {
  return { id, mimeType, sizeBytes, hasThumbnail };
}

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
    attachments: linkedAttachments(db, expense.id),
    receiptId: null,
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

/** Every given `ListExpensesQuery` filter matches, as in the backend. */
function matchesFilters(
  expense: MockExpense,
  { categoryId, userId, from, to }: ListExpensesQuery
) {
  const inCategory =
    categoryId === undefined ||
    expense.categoryId === (categoryId === UNCATEGORIZED ? null : categoryId);
  const onExpense =
    userId === undefined ||
    [...expense.payers, ...expense.allocation.participants].some(
      (entry) => entry.userId === userId
    );
  return (
    inCategory &&
    onExpense &&
    (from === undefined || expense.expenseDate >= from) &&
    (to === undefined || expense.expenseDate <= to)
  );
}

/**
 * Words that put an expense in one of the default categories. The mock
 * "model" is `high` on these and on a category's own name, and otherwise
 * guesses Other with `low`.
 */
const CATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  groceries: ["grocer", "supermarket", "milk", "bread"],
  utilities: ["electricity", "water", "internet", "heating"],
  transport: ["fuel", "taxi", "bus", "train", "ticket"],
  "dining out": ["pizza", "restaurant", "dinner", "lunch"],
  entertainment: ["cinema", "movie", "concert", "netflix"],
};

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

  suggestExpenseCategory: {
    module: "expenses",
    // Only the text is looked at: the mocks don't read attachments.
    resolve: ({ db, household, body }) => {
      if (!household.features.ai) {
        throw new MockApiError(
          403,
          "MODULE_DISABLED",
          "The ai module is disabled",
          { module: "ai" }
        );
      }
      const text = `${body.name ?? ""} ${body.description ?? ""}`.toLowerCase();
      const categories = db.state.categories.filter(
        ({ householdId }) => householdId === household.id
      );
      const match = categories.find(({ name }) => {
        const key = name.toLowerCase();
        return (
          text.includes(key) ||
          CATEGORY_KEYWORDS[key]?.some((word) => text.includes(word))
        );
      });
      if (match) {
        return { suggestion: { categoryId: match.id, confidence: "high" } };
      }
      const other = categories.find(
        ({ name }) => name.toLowerCase() === "other"
      );
      return {
        suggestion: other ? { categoryId: other.id, confidence: "low" } : null,
      };
    },
  },

  listExpenses: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          db.state.expenses.filter(
            (expense) =>
              expense.householdId === household.id &&
              matchesFilters(expense, query)
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
      // The files stay, unlinked, for the backend's cleanup to delete.
      db.state.expenseAttachments = db.state.expenseAttachments.filter(
        (link) => link.expenseId !== expense.id
      );
    },
  },

  listExpenseAttachments: {
    resolve: ({ db, household, params }) => ({
      items: linkedAttachments(
        db,
        findInHousehold(db.state.expenses, household.id, params.expenseId).id
      ),
    }),
  },

  linkExpenseAttachment: {
    module: "expenses",
    resolve: ({ db, household, member, userId, params, body }) => {
      const expense = findInHousehold(
        db.state.expenses,
        household.id,
        params.expenseId
      );
      assertAuthorOrAdmin(expense, userId, member.role);
      const attachment = db.state.attachments.find(
        ({ id, householdId }) =>
          id === body.attachmentId && householdId === household.id
      );
      if (!attachment) {
        throw invalidReference([
          { path: ["attachmentId"], message: "Unknown attachment" },
        ]);
      }
      const links = db.state.expenseAttachments.filter(
        (link) => link.expenseId === expense.id
      );
      if (links.some((link) => link.attachmentId === attachment.id)) {
        throw conflict(
          "ATTACHMENT_ALREADY_LINKED",
          "The file is already attached to this expense"
        );
      }
      if (links.length >= ATTACHMENT_MAX_PER_EXPENSE) {
        throw new MockApiError(
          409,
          "EXPENSE_ATTACHMENT_LIMIT_REACHED",
          "The expense has as many files as it can",
          { limit: ATTACHMENT_MAX_PER_EXPENSE }
        );
      }
      db.state.expenseAttachments.push({
        householdId: household.id,
        expenseId: expense.id,
        attachmentId: attachment.id,
        createdAt: now(),
      });
      return toSummary(attachment);
    },
  },

  unlinkExpenseAttachment: {
    module: "expenses",
    resolve: ({ db, household, member, userId, params }) => {
      const expense = findInHousehold(
        db.state.expenses,
        household.id,
        params.expenseId
      );
      assertAuthorOrAdmin(expense, userId, member.role);
      const link = db.state.expenseAttachments.find(
        (row) =>
          row.expenseId === expense.id &&
          row.attachmentId === params.attachmentId
      );
      if (!link) {
        throw notFound();
      }
      removeRow(db.state.expenseAttachments, link);
    },
  },

  listSettlements: {
    resolve: ({ db, household, query }) =>
      paginate(
        sortBy(
          db.state.settlements.filter(
            ({ householdId, confirmedAt }) =>
              householdId === household.id &&
              (query.status === undefined ||
                (query.status === "pending") === (confirmedAt === null))
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

  writeOffBalance: {
    minRole: "admin",
    module: "expenses",
    resolve: ({ db, household, userId, body }) => {
      if (!db.isParty(household.id, body.userId)) {
        throw invalidReference([
          { path: ["userId"], message: "Not a household party" },
        ]);
      }
      const members = db.members(household.id);
      if (members.some((member) => member.userId === body.userId)) {
        throw conflict(
          "MEMBER_NOT_DEPARTED",
          "Only a departed member's balance can be written off"
        );
      }
      const group =
        listBalances(db, household.id).items.find(
          ({ currency }) => currency === body.currency
        )?.balances ?? [];
      const subject = group.find(({ user }) => user.id === body.userId);
      if (subject?.amountCents !== body.amountCents) {
        throw conflict("BALANCE_CHANGED", "The balance isn't the one given");
      }
      const pending = db.state.settlements.some(
        (settlement) =>
          settlement.householdId === household.id &&
          settlement.confirmedAt === null &&
          settlement.amount.currency === body.currency &&
          (settlement.payerId === body.userId ||
            settlement.payeeId === body.userId)
      );
      if (pending) {
        throw conflict(
          "HAS_PENDING_PAYMENTS",
          "Their pending payments must be confirmed or deleted first"
        );
      }
      const time = now();
      const payments = planWriteOff(
        body.method,
        subject,
        group,
        members.map((member) => db.summary(member.userId))
      );
      return {
        items: payments.map(({ payer, payee, amountCents }) => {
          const settlement: MockSettlement = {
            id: crypto.randomUUID(),
            householdId: household.id,
            payerId: payer.id,
            payeeId: payee.id,
            createdById: userId,
            amount: { amountCents, currency: body.currency },
            note: WRITE_OFF_NOTE,
            createdAt: time,
            confirmedById: userId,
            confirmedAt: time,
          };
          db.state.settlements.push(settlement);
          return renderSettlement(db, settlement) as ConfirmedSettlement;
        }),
      };
    },
  },

  listBalances: {
    resolve: ({ db, household }) => listBalances(db, household.id),
  },

  listSettlementSuggestions: {
    resolve: ({ db, household }) => suggestSettlements(db, household.id),
  },
};
