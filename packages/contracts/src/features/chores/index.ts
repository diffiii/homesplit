import { z } from "zod";

import { IsoDate, IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { UserSummary } from "../users";

/** Household chore / task. */
export const Chore = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  assignedTo: UserSummary.nullable(),
  dueDate: IsoDate.nullable(), // we could consider adding a due time as well (IsoDateTime)
  addedBy: UserSummary,
  isCompleted: z.boolean(),
  completedAt: IsoDateTime.nullable(),
  completedBy: UserSummary.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Chore = z.infer<typeof Chore>;

const ChoreWritableFields = z.object({
  name: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  assignedToId: Id.nullable().optional(),
  dueDate: IsoDate.nullable().optional(),
});

/** Create a chore; completion state is set by Complete/Reopen actions. */
export const CreateChoreRequest = ChoreWritableFields;

/** Partial update of writable fields only (not completion state). */
export const UpdateChoreRequest = ChoreWritableFields.partial();

/** List chores; by default excludes completed. */
export const ListChoresQuery = Pagination.extend({
  includeCompleted: z.boolean().default(false),
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
export type CompleteChoreResponse = Chore;

/** Response for reopening a completed chore. */
export type ReopenChoreResponse = Chore;
