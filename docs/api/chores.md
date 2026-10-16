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

## Rules

- Server-set fields: `addedBy`, `createdAt`, `updatedAt`, `isCompleted`, `completedAt`, `completedBy`.
- References and eligibility: `assignedToId` must be a current member of the household.
- Ordering: Open before completed, deadline asc with no deadline last, `createdAt` asc, `id` asc.
- Repeated and concurrent requests: Standard PATCH overrides writable fields.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_REFERENCE` | `assignedToId` is not a current member of the household. |