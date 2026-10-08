import { type Id, MAX_AMOUNT_CENTS } from "@homesplit/contracts";

import { AllocationError, type AllocationErrorCode } from "./allocation-error";

export function assertValidTotal(totalCents: number) {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 1 ||
    totalCents > MAX_AMOUNT_CENTS
  ) {
    throw new AllocationError(
      "INVALID_TOTAL",
      `Total must be an integer from 1 to ${MAX_AMOUNT_CENTS}`
    );
  }
}

/** Rejects an empty participant list and duplicate users. */
export function assertUniqueParticipants(
  participants: readonly { userId: Id }[]
) {
  if (participants.length === 0) {
    throw new AllocationError(
      "EMPTY_PARTICIPANTS",
      "At least one participant is required"
    );
  }
  const seen = new Set<Id>();
  for (const { userId } of participants) {
    if (seen.has(userId)) {
      throw new AllocationError(
        "DUPLICATE_PARTICIPANT",
        `Duplicate participant: ${userId}`
      );
    }
    seen.add(userId);
  }
}

/** Returns `value` as a bigint, or throws `code` unless it's an integer from `min` to `max`. */
export function readInteger(
  userId: Id,
  value: number,
  min: number,
  max: number,
  code: AllocationErrorCode
): bigint {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AllocationError(
      code,
      `Participant ${userId} has ${value}, expected an integer from ${min} to ${max}`
    );
  }
  return BigInt(value);
}

export const sum = (values: readonly bigint[]) =>
  values.reduce((acc, value) => acc + value, 0n);
