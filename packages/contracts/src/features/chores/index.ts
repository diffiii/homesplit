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
  dueAt: IsoDateTime.nullable(),
  addedBy: UserSummary,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const OpenChore = ChoreBase.extend({
  isCompleted: z.literal(false),
  completedAt: z.null(),
  completedBy: z.null(),
});
export type OpenChore = z.infer<typeof OpenChore>;

export const CompletedChore = ChoreBase.extend({
  isCompleted: z.literal(true),
  completedAt: IsoDateTime,
  completedBy: UserSummary,
});
export type CompletedChore = z.infer<typeof CompletedChore>;

export const Chore = z.discriminatedUnion("isCompleted", [
  OpenChore,
  CompletedChore,
]);
export type Chore = z.infer<typeof Chore>;

const ChoreWritableFields = z.object({
  name: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  assignedToId: Id.nullable().optional(),
  dueAt: z.string().nullable().optional(),
});

export const CreateChoreRequest = ChoreWritableFields;
export const UpdateChoreRequest = ChoreWritableFields.partial();

export const ListChoresQuery = Pagination.extend({
  includeCompleted: queryBoolean().default(false),
});
export type ListChoresQuery = z.infer<typeof ListChoresQuery>;

export const ChoreListResponse = paginatedResponse(Chore);
export type ChoreListResponse = z.infer<typeof ChoreListResponse>;

export const ChoreIdParams = z.object({
  householdId: Id,
  choreId: Id,
});
export type ChoreIdParams = z.infer<typeof ChoreIdParams>;

export type CompleteChoreResponse = CompletedChore;
export type ReopenChoreResponse = OpenChore;
