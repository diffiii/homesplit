# Chores API

Module flag: `chores` · Tasks: #46 · Contracts: [chores.ts](../../packages/contracts/src/features/chores/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/households/:householdId/chores` | `CreateChoreRequest` | `Chore` | 201 | all |
| GET | `/api/households/:householdId/chores` | `ListChoresQuery` | `ChoreListResponse` | 200 | all |
| GET | `/api/households/:householdId/chores/:choreId` | `ChoreIdParams` | `Chore` | 200 | all |
| PATCH | `/api/households/:householdId/chores/:choreId` | `UpdateChoreRequest` | `Chore` | 200 | all |
| DELETE | `/api/households/:householdId/chores/:choreId` | `ChoreIdParams` | - | 204 | all |
| POST | `/api/households/:householdId/chores/:choreId/complete` | `ChoreIdParams` | `CompletedChore` | 200 | all |
| POST | `/api/households/:householdId/chores/:choreId/reopen` | `ChoreIdParams` | `OpenChore` | 200 | all |

## Rules

- Server-set fields: `addedBy`, `createdAt`, `updatedAt`, `isCompleted`, `completedAt`, `completedBy`.
- References and eligibility: `assignedToId` must be a current member of the household.
- Ordering: Open before completed, deadline asc with no deadline last, `createdAt` asc, `id` asc.
- Completion: new chores are open, with null `completedAt` and `completedBy`. `complete` sets `isCompleted`, `completedBy` to the caller, and `completedAt` to now in one update; `reopen` clears all three. The `chores_completion` check enforces that open chores have neither field and completed chores have both. Like every FK from household data to `user`, `completed_by_id` is `ON DELETE RESTRICT`.
- Repeated and concurrent requests: Standard PATCH overrides writable fields. `complete` and `reopen` are idempotent: completing a completed chore answers 200 with it unchanged, keeping the original `completedBy` and `completedAt`, and reopening an open chore answers 200 with it unchanged. Each transition locks the chore row `FOR UPDATE`, so concurrent transitions are serialized: of two simultaneous completes, the first wins and the second sees it, and the last of a complete and a reopen decides the state.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_REFERENCE` | `assignedToId` is not a current member of the household. |