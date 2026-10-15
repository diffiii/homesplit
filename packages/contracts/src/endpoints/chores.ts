import {
  Chore,
  ChoreIdParams,
  ChoreListResponse,
  CompletedChore,
  CreateChoreRequest,
  ListChoresQuery,
  OpenChore,
  UpdateChoreRequest,
} from "../features/chores";
import { HouseholdIdParams } from "../features/households";
import type { Endpoint } from "./endpoint";
import { HOUSEHOLD } from "./paths";

const CHORE = `${HOUSEHOLD}/chores/:choreId`;

export const choreEndpoints = {
  listChores: {
    method: "GET",
    path: `${HOUSEHOLD}/chores`,
    params: HouseholdIdParams,
    query: ListChoresQuery,
    status: 200,
    response: ChoreListResponse,
  },
  createChore: {
    method: "POST",
    path: `${HOUSEHOLD}/chores`,
    params: HouseholdIdParams,
    body: CreateChoreRequest,
    status: 201,
    response: Chore,
  },
  getChore: {
    method: "GET",
    path: CHORE,
    params: ChoreIdParams,
    status: 200,
    response: Chore,
  },
  updateChore: {
    method: "PATCH",
    path: CHORE,
    params: ChoreIdParams,
    body: UpdateChoreRequest,
    status: 200,
    response: Chore,
  },
  deleteChore: {
    method: "DELETE",
    path: CHORE,
    params: ChoreIdParams,
    status: 204,
    response: null,
  },
  completeChore: {
    method: "POST",
    path: `${CHORE}/complete`,
    params: ChoreIdParams,
    status: 200,
    response: CompletedChore,
  },
  reopenChore: {
    method: "POST",
    path: `${CHORE}/reopen`,
    params: ChoreIdParams,
    status: 200,
    response: OpenChore,
  },
} as const satisfies Record<string, Endpoint>;
