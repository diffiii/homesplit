import { z } from "zod";

import { Id } from "../../../common/id";
import { BoundedCents, MAX_SHARES } from "../../../common/money";

/** How an expense total is divided among participants. */
export const SplitMethod = z.enum([
  "equal",
  "percentage",
  "shares",
  "exact",
  "adjustment",
]);
export type SplitMethod = z.infer<typeof SplitMethod>;

/** 100% expressed in basis points. */
export const FULL_PERCENTAGE_BASIS_POINTS = 10_000;

const AllocationParticipant = z.strictObject({ userId: Id });

/**
 * Allocation strategy for an expense. Amounts are calculated by `allocate`
 * in this package; the same code runs on the client and the server. Users who
 * don't take part are left out of `participants`.
 */
export const ExpenseAllocationInput = z.discriminatedUnion("method", [
  z.strictObject({
    method: z.literal(SplitMethod.enum.equal),
    participants: z.array(AllocationParticipant).min(1),
  }),
  z.strictObject({
    method: z.literal(SplitMethod.enum.percentage),
    participants: z
      .array(
        AllocationParticipant.extend({
          basisPoints: z.int().positive().max(FULL_PERCENTAGE_BASIS_POINTS),
        })
      )
      .min(1),
  }),
  z.strictObject({
    method: z.literal(SplitMethod.enum.shares),
    participants: z
      .array(
        AllocationParticipant.extend({
          shares: z.int().positive().max(MAX_SHARES),
        })
      )
      .min(1),
  }),
  z.strictObject({
    method: z.literal(SplitMethod.enum.exact),
    participants: z
      .array(
        AllocationParticipant.extend({
          amountCents: BoundedCents.nonnegative(),
        })
      )
      .min(1),
  }),
  z.strictObject({
    method: z.literal(SplitMethod.enum.adjustment),
    // Remainder after adjustments is split equally, then each adjustment is added.
    participants: z
      .array(AllocationParticipant.extend({ adjustmentCents: BoundedCents }))
      .min(1),
  }),
]);
export type ExpenseAllocationInput = z.infer<typeof ExpenseAllocationInput>;
