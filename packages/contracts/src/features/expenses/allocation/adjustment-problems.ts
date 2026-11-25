import { sum } from "./validation";

/** Why adjustments can't split a total, with the participant it's about. */
export type AdjustmentProblem =
  | { reason: "below_total"; index: number }
  | { reason: "sum_over_total" }
  | { reason: "negative_share"; index: number };
export type AdjustmentProblemReason = AdjustmentProblem["reason"];

/**
 * What stops `adjustmentsCents` splitting `totalCents`, or nothing; see
 * `docs/money.md`. No adjustment may be below minus the total, and they may
 * add up to at most the total. Only once both hold is each share checked:
 * nobody's may be negative before rounding. Takes integers and works exactly.
 */
export function adjustmentProblems(
  totalCents: number,
  adjustmentsCents: readonly number[]
): AdjustmentProblem[] {
  const total = BigInt(totalCents);
  const adjustments = adjustmentsCents.map((cents) => BigInt(cents));
  const residual = total - sum(adjustments);
  const outOfRange: AdjustmentProblem[] = adjustments.flatMap(
    (adjustment, index) =>
      adjustment < -total ? [{ reason: "below_total" as const, index }] : []
  );
  if (residual < 0n) {
    outOfRange.push({ reason: "sum_over_total" });
  }
  if (outOfRange.length > 0) {
    return outOfRange;
  }
  // residual / people + adjustment < 0, without dividing.
  const people = BigInt(adjustments.length);
  return adjustments.flatMap((adjustment, index) =>
    residual + adjustment * people < 0n
      ? [{ reason: "negative_share" as const, index }]
      : []
  );
}
