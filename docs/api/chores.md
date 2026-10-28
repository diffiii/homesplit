# Chores API

Module flag: `chores` · Tasks: #46, #118 · Contracts: [chores.ts](../../packages/contracts/src/features/chores/index.ts)

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
- Filters: see [Filtering the list](#filtering-the-list).
- Completion: new chores are open, with null `completedAt` and `completedBy`. `complete` sets `isCompleted`, `completedBy` to the caller, and `completedAt` to now in one update; `reopen` clears all three. The `chores_completion` check enforces that open chores have neither field and completed chores have both. Like every FK from household data to `user`, `completed_by_id` is `ON DELETE RESTRICT`.
- Repeated and concurrent requests: Standard PATCH overrides writable fields. `complete` and `reopen` are idempotent: completing a completed chore answers 200 with it unchanged, keeping the original `completedBy` and `completedAt`, and reopening an open chore answers 200 with it unchanged. Each transition locks the chore row `FOR UPDATE`, so concurrent transitions are serialized: of two simultaneous completes, the first wins and the second sees it, and the last of a complete and a reopen decides the state.

### Filtering the list

`GET /chores` takes optional filters in `ListChoresQuery`, next to `page` and `pageSize`. They combine with AND, following the [list rules](../decisions.md#lists).

| Parameter | Matches |
| --- | --- |
| `includeCompleted` | Completed chores as well as open ones. Without it, only open chores. |
| `assignedToId` | Chores assigned to that user. Unassigned chores never match. |

- `assignedToId` accepts any user and isn't checked against the household, so a [departed member](../decisions.md#departed-members)'s open chores can be found and reassigned. Another household's user, or an unknown ID, matches nothing: 200 with empty `items` and `totalItems` 0. A malformed ID answers 400 `VALIDATION_ERROR`.
- `chores_assignee_list_idx` on (`household_id`, `assigned_to_id`, `is_completed`, `due_at`, `created_at`, `id`) serves the filter in the list order, with or without `includeCompleted`. `chores_assignedToId_idx` stays for the `ON DELETE SET NULL` lookup when a user is deleted.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_REFERENCE` | `assignedToId` is not a current member of the household. |