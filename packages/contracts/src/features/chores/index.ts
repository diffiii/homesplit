import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { queryBoolean } from "../../common/query";
import { UserSummary } from "../users";

const ChoreBase = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  assignedTo: UserSummary.nullable(),
  /** Optional deadline as an ISO 8601 UTC datetime. */
  dueDate: IsoDateTime.nullable(),
  addedBy: UserSummary,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/** Chore that has not been completed yet. */
export const OpenChore = ChoreBase.extend({
  isCompleted: z.literal(false),
  completedAt: z.null(),
  completedBy: z.null(),
});
export type OpenChore = z.infer<typeof OpenChore>;

/** Completed chore with its completion metadata. */
export const CompletedChore = ChoreBase.extend({
  isCompleted: z.literal(true),
  completedAt: IsoDateTime,
  completedBy: UserSummary,
});
export type CompletedChore = z.infer<typeof CompletedChore>;

/** Household chore / task; `isCompleted` narrows the completion metadata. */
export const Chore = z.discriminatedUnion("isCompleted", [
  OpenChore,
  CompletedChore,
]);
export type Chore = z.infer<typeof Chore>;

const ChoreWritableFields = z.object({
  name: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  assignedToId: Id.nullable().optional(),
  /** Optional deadline as an ISO 8601 UTC datetime; null clears it. */
  dueDate: IsoDateTime.nullable().optional(),
});

/** Create a chore; completion state is set by Complete/Reopen actions. */
export const CreateChoreRequest = ChoreWritableFields;

/** Partial update of writable fields only (not completion state). */
export const UpdateChoreRequest = ChoreWritableFields.partial();

/** List chores; by default excludes completed. Decodes raw URL query strings. */
export const ListChoresQuery = Pagination.extend({
  includeCompleted: queryBoolean().default(false),
});
export type ListChoresQuery = z.infer<typeof ListChoresQuery>;

/** Paginated chore response list. */
export const ChoreListResponse = paginatedResponse(Chore);
export type ChoreListResponse = z.infer<typeof ChoreListResponse>;

/**
 * Path params for chore-scoped routes (update / complete / reopen / delete).
 */
export const ChoreIdParams = z.object({
  householdId: Id,
  choreId: Id,
});
export type ChoreIdParams = z.infer<typeof ChoreIdParams>;

/** Response for completing a chore. */
export type CompleteChoreResponse = CompletedChore;

/** Response for reopening a completed chore. */
export type ReopenChoreResponse = OpenChore;
