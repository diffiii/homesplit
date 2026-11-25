import { z } from "zod";

import { IsoDate, IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import {
  BoundedPositiveCents,
  BoundedPositiveMoney,
  Cents,
  PositiveCents,
  PositiveMoney,
} from "../../common/money";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { AttachmentSummary } from "../attachments";
import { UserSummary } from "../users";
import {
  type AdjustmentProblemReason,
  adjustmentProblems,
} from "./allocation/adjustment-problems";
import {
  ExpenseAllocationInput,
  FULL_PERCENTAGE_BASIS_POINTS,
} from "./allocation/input";
import { ExpenseCategory } from "./categories";

export * from "./allocation";
export * from "./categories";
export * from "./settlements";
export * from "./write-offs";

/** Amount a user actually paid towards an expense. */
export const ExpensePayerInput = z.strictObject({
  userId: Id,
  amountCents: BoundedPositiveCents,
});
export type ExpensePayerInput = z.infer<typeof ExpensePayerInput>;

const ExpenseFinancialFields = z.strictObject({
  total: BoundedPositiveMoney,
  payers: z.array(ExpensePayerInput).min(1),
  allocation: ExpenseAllocationInput,
});
type ExpenseFinancialFields = z.infer<typeof ExpenseFinancialFields>;

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

function addDuplicateUserIssues(
  entries: { userId: Id }[],
  path: (string | number)[],
  ctx: z.RefinementCtx
) {
  const seen = new Set<Id>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.userId)) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate user",
        path: [...path, index, "userId"],
      });
    }
    seen.add(entry.userId);
  });
}

/** Each adjustment issue carries its reason as `params.reason`. */
const adjustmentMessages: Record<AdjustmentProblemReason, string> = {
  below_total: "An adjustment can't take away more than the total",
  sum_over_total: "Adjustments must add up to at most the total",
  negative_share: "Adjustment results in a negative share",
};

function validateFinancialSpec(
  spec: ExpenseFinancialFields,
  ctx: z.RefinementCtx
) {
  const total = spec.total.amountCents;
  const { allocation } = spec;

  addDuplicateUserIssues(spec.payers, ["payers"], ctx);
  addDuplicateUserIssues(
    allocation.participants,
    ["allocation", "participants"],
    ctx
  );

  if (sum(spec.payers.map((p) => p.amountCents)) !== total) {
    ctx.addIssue({
      code: "custom",
      message: "Payer amounts must sum to the total",
      path: ["payers"],
    });
  }

  const participantsPath = ["allocation", "participants"];
  switch (allocation.method) {
    case "percentage":
      if (
        sum(allocation.participants.map((p) => p.basisPoints)) !==
        FULL_PERCENTAGE_BASIS_POINTS
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Percentages must sum to 100%",
          path: participantsPath,
        });
      }
      break;
    case "exact":
      if (sum(allocation.participants.map((p) => p.amountCents)) !== total) {
        ctx.addIssue({
          code: "custom",
          message: "Split amounts must sum to the total",
          path: participantsPath,
        });
      }
      break;
    case "adjustment": {
      const problems = adjustmentProblems(
        total,
        allocation.participants.map((p) => p.adjustmentCents)
      );
      for (const problem of problems) {
        ctx.addIssue({
          code: "custom",
          message: adjustmentMessages[problem.reason],
          path:
            "index" in problem
              ? [...participantsPath, problem.index, "adjustmentCents"]
              : participantsPath,
          params: { reason: problem.reason },
        });
      }
      break;
    }
    default:
      break;
  }
}

/** Total, payers and allocation; always replaced and validated together. */
export const ExpenseFinancialSpec = ExpenseFinancialFields.superRefine(
  validateFinancialSpec
);
export type ExpenseFinancialSpec = z.infer<typeof ExpenseFinancialSpec>;

const ExpenseDescriptiveFields = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  categoryId: Id.nullable().optional(),
  expenseDate: IsoDate,
});

/** Payer's contribution to an expense. */
export const ExpensePayer = z.object({
  user: UserSummary,
  amountCents: PositiveCents,
});
export type ExpensePayer = z.infer<typeof ExpensePayer>;

/** One participant's calculated share of an expense (currency from `total`). */
export const ExpenseSplit = z.object({
  user: UserSummary,
  amountCents: Cents,
});
export type ExpenseSplit = z.infer<typeof ExpenseSplit>;

/**
 * Household expense with payers, author, allocation strategy, splits, and the
 * files linked to it, oldest link first.
 */
export const Expense = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  total: PositiveMoney,
  payers: z.array(ExpensePayer),
  author: UserSummary,
  category: ExpenseCategory.nullable(),
  expenseDate: IsoDate,
  allocation: ExpenseAllocationInput,
  splits: z.array(ExpenseSplit),
  attachments: z.array(AttachmentSummary),
  /** The receipt the expense was made from, until its amounts are edited. */
  receiptId: Id.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Expense = z.infer<typeof Expense>;

/** Create an expense; author is the authenticated user. */
export const CreateExpenseRequest = ExpenseDescriptiveFields.extend(
  ExpenseFinancialFields.shape
).superRefine(validateFinancialSpec);
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequest>;

/**
 * Update an expense. Descriptive fields can be patched independently;
 * the financial spec is replaced as a whole.
 */
export const UpdateExpenseRequest = ExpenseDescriptiveFields.partial().extend({
  financial: ExpenseFinancialSpec.optional(),
});
export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseRequest>;

/** `categoryId` value that matches expenses without a category. */
export const UNCATEGORIZED = "none";

/**
 * List expenses with offset pagination. Every given filter must match:
 * `categoryId` (or `UNCATEGORIZED`), `userId` as a payer or allocation
 * participant, and `from` / `to` as inclusive bounds on `expenseDate`.
 */
export const ListExpensesQuery = Pagination.extend({
  categoryId: z.union([Id, z.literal(UNCATEGORIZED)]).optional(),
  userId: Id.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
}).refine(({ from, to }) => !(from && to && from > to), {
  message: "`from` must not be after `to`",
  path: ["from"],
});
export type ListExpensesQuery = z.infer<typeof ListExpensesQuery>;

/** Paginated expense response list. */
export const ExpenseListResponse = paginatedResponse(Expense);
export type ExpenseListResponse = z.infer<typeof ExpenseListResponse>;

/**
 * Path params for expense-scoped routes (get / update / delete).
 */
export const ExpenseIdParams = z.object({
  householdId: Id,
  expenseId: Id,
});
export type ExpenseIdParams = z.infer<typeof ExpenseIdParams>;

/** Link an uploaded file of the expense's household to the expense. */
export const LinkExpenseAttachmentRequest = z.strictObject({
  attachmentId: Id,
});
export type LinkExpenseAttachmentRequest = z.infer<
  typeof LinkExpenseAttachmentRequest
>;

/** Files linked to one expense, oldest link first; unpaginated. */
export const ExpenseAttachmentListResponse = z.object({
  items: z.array(AttachmentSummary),
});
export type ExpenseAttachmentListResponse = z.infer<
  typeof ExpenseAttachmentListResponse
>;

/** Path params for one file linked to an expense. */
export const ExpenseAttachmentIdParams = ExpenseIdParams.extend({
  attachmentId: Id,
});
export type ExpenseAttachmentIdParams = z.infer<
  typeof ExpenseAttachmentIdParams
>;

/** Response for fetching a single expense by id. */
export type GetExpenseResponse = Expense;
