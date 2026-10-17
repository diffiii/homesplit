import { z } from "zod";

import { IsoDateTime } from "../../common/datetime";
import { Id } from "../../common/id";
import { Pagination, paginatedResponse } from "../../common/pagination";
import { queryBoolean } from "../../common/query";
import { UserSummary } from "../users";

/**
 * Base properties shared across all chore entities.
 */
const ChoreBase = z.object({
  id: Id,
  householdId: Id,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  assignedTo: UserSummary.nullable(),
  dueAt: IsoDateTime.nullable(),
  addedBy: UserSummary,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/**
 * An open (uncompleted) chore.
 */
export const OpenChore = ChoreBase.extend({
  isCompleted: z.literal(false),
  completedAt: z.null(),
  completedBy: z.null(),
});
export type OpenChore = z.infer<typeof OpenChore>;

/**
 * A completed chore containing completion metadata.
 */
export const CompletedChore = ChoreBase.extend({
  isCompleted: z.literal(true),
  completedAt: IsoDateTime,
  completedBy: UserSummary,
});
export type CompletedChore = z.infer<typeof CompletedChore>;

/**
 * Chore entity representation (discriminated by `isCompleted`).
 */
export const Chore = z.discriminatedUnion("isCompleted", [
  OpenChore,
  CompletedChore,
]);
export type Chore = z.infer<typeof Chore>;

/**
 * Writable fields for chore creation and updates.
 */
const ChoreWritableFields = z.object({
  name: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  assignedToId: Id.nullable().optional(),
  dueAt: IsoDateTime.nullable().optional(),
});

/**
 * Request payload for creating a new chore.
 */
export const CreateChoreRequest = ChoreWritableFields;
export type CreateChoreRequest = z.infer<typeof CreateChoreRequest>;

/**
 * Request payload for updating an existing chore.
 */
export const UpdateChoreRequest = ChoreWritableFields.partial();
export type UpdateChoreRequest = z.infer<typeof UpdateChoreRequest>;

/**
 * Query parameters for listing chores in a household.
 */
export const ListChoresQuery = Pagination.extend({
  includeCompleted: queryBoolean().default(false),
});
export type ListChoresQuery = z.infer<typeof ListChoresQuery>;

/**
 * Paginated response of chores.
 */
export const ChoreListResponse = paginatedResponse(Chore);
export type ChoreListResponse = z.infer<typeof ChoreListResponse>;

/**
 * URL parameter schema for chore routes.
 */
export const ChoreIdParams = z.object({
  householdId: Id,
  choreId: Id,
});
export type ChoreIdParams = z.infer<typeof ChoreIdParams>;

export type CompleteChoreResponse = CompletedChore;
export type ReopenChoreResponse = OpenChore;
