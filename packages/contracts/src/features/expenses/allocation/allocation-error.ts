export type AllocationErrorCode =
  | "INVALID_TOTAL"
  | "EMPTY_PARTICIPANTS"
  | "DUPLICATE_PARTICIPANT"
  | "INVALID_WEIGHT"
  | "INVALID_AMOUNT"
  | "PERCENTAGE_SUM_MISMATCH"
  | "EXACT_SUM_MISMATCH"
  | "ADJUSTMENT_SUM_EXCEEDS_TOTAL"
  | "NEGATIVE_SHARE";

/** Allocation input that the engine refuses to split. */
export class AllocationError extends Error {
  readonly code: AllocationErrorCode;

  constructor(code: AllocationErrorCode, message: string) {
    super(message);
    this.name = "AllocationError";
    this.code = code;
  }
}
