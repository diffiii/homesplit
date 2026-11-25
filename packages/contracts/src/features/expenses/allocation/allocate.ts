import { distributeProportionally } from "../../../common/distribute";
import type { Id } from "../../../common/id";
import { MAX_AMOUNT_CENTS, MAX_SHARES } from "../../../common/money";
import { toSafeInteger } from "../../../common/safe-integer";
import {
  type AdjustmentProblem,
  adjustmentProblems,
} from "./adjustment-problems";
import { AllocationError } from "./allocation-error";
import {
  type ExpenseAllocationInput,
  FULL_PERCENTAGE_BASIS_POINTS,
} from "./input";
import {
  assertUniqueParticipants,
  assertValidTotal,
  readInteger,
  sum,
} from "./validation";

/** One participant's calculated share, in the expense's minor units. */
export interface AllocatedSplit {
  amountCents: number;
  userId: Id;
}

type ParticipantsOf<M extends ExpenseAllocationInput["method"]> = Extract<
  ExpenseAllocationInput,
  { method: M }
>["participants"];

/** Splits `total` by `weights`; returns one amount per participant, in input order. */
const splitByWeights = (
  total: bigint,
  participants: readonly { userId: Id }[],
  weights: readonly bigint[]
): bigint[] =>
  distributeProportionally(
    total,
    participants.map(({ userId }, i) => ({ key: userId, weight: weights[i] }))
  ).map(({ amount }) => amount);

const splitEqually = (total: bigint, participants: ParticipantsOf<"equal">) =>
  splitByWeights(
    total,
    participants,
    participants.map(() => 1n)
  );

function splitByPercentage(
  total: bigint,
  participants: ParticipantsOf<"percentage">
): bigint[] {
  const basisPoints = participants.map((p) =>
    readInteger(
      p.userId,
      p.basisPoints,
      1,
      FULL_PERCENTAGE_BASIS_POINTS,
      "INVALID_WEIGHT"
    )
  );
  if (sum(basisPoints) !== BigInt(FULL_PERCENTAGE_BASIS_POINTS)) {
    throw new AllocationError(
      "PERCENTAGE_SUM_MISMATCH",
      `Basis points must add up to ${FULL_PERCENTAGE_BASIS_POINTS}`
    );
  }
  return splitByWeights(total, participants, basisPoints);
}

function splitByShares(
  total: bigint,
  participants: ParticipantsOf<"shares">
): bigint[] {
  const shares = participants.map((p) =>
    readInteger(p.userId, p.shares, 1, MAX_SHARES, "INVALID_WEIGHT")
  );
  return splitByWeights(total, participants, shares);
}

function useExactAmounts(
  total: bigint,
  participants: ParticipantsOf<"exact">
): bigint[] {
  const amounts = participants.map((p) =>
    readInteger(p.userId, p.amountCents, 0, MAX_AMOUNT_CENTS, "INVALID_AMOUNT")
  );
  if (sum(amounts) !== total) {
    throw new AllocationError(
      "EXACT_SUM_MISMATCH",
      "Exact amounts must add up to the total"
    );
  }
  return amounts;
}

function adjustmentError(
  problem: AdjustmentProblem,
  participants: ParticipantsOf<"adjustment">
): AllocationError {
  switch (problem.reason) {
    case "below_total":
      return new AllocationError(
        "INVALID_AMOUNT",
        `Participant ${participants[problem.index].userId}'s adjustment is below minus the total`
      );
    case "sum_over_total":
      return new AllocationError(
        "ADJUSTMENT_SUM_EXCEEDS_TOTAL",
        "Adjustments must add up to at most the total"
      );
    case "negative_share":
      return new AllocationError(
        "NEGATIVE_SHARE",
        `Participant ${participants[problem.index].userId} would get a negative share`
      );
    default: {
      const unknown: never = problem;
      throw new Error(`Unknown problem: ${JSON.stringify(unknown)}`);
    }
  }
}

function splitWithAdjustments(
  total: bigint,
  participants: ParticipantsOf<"adjustment">
): bigint[] {
  const adjustments = participants.map((p) =>
    readInteger(
      p.userId,
      p.adjustmentCents,
      -MAX_AMOUNT_CENTS,
      MAX_AMOUNT_CENTS,
      "INVALID_AMOUNT"
    )
  );
  const [problem] = adjustmentProblems(
    toSafeInteger(total),
    participants.map((p) => p.adjustmentCents)
  );
  if (problem) {
    throw adjustmentError(problem, participants);
  }
  return splitEqually(total - sum(adjustments), participants).map(
    (amount, i) => amount + adjustments[i]
  );
}

function computeAmounts(
  total: bigint,
  allocation: ExpenseAllocationInput
): bigint[] {
  switch (allocation.method) {
    case "equal":
      return splitEqually(total, allocation.participants);
    case "percentage":
      return splitByPercentage(total, allocation.participants);
    case "shares":
      return splitByShares(total, allocation.participants);
    case "exact":
      return useExactAmounts(total, allocation.participants);
    case "adjustment":
      return splitWithAdjustments(total, allocation.participants);
    default: {
      const unsupported: never = allocation;
      throw new Error(`Unsupported allocation: ${JSON.stringify(unsupported)}`);
    }
  }
}

/**
 * Splits `totalCents` among the allocation's participants. The result has
 * one entry per participant, in input order, with non-negative amounts that
 * add up exactly to the total. Amounts depend only on the participant set;
 * see `docs/money.md` for the rounding rule.
 */
export function allocate(
  totalCents: number,
  allocation: ExpenseAllocationInput
): AllocatedSplit[] {
  assertValidTotal(totalCents);
  assertUniqueParticipants(allocation.participants);
  const amounts = computeAmounts(BigInt(totalCents), allocation);
  return allocation.participants.map(({ userId }, i) => ({
    userId,
    amountCents: toSafeInteger(amounts[i]),
  }));
}
