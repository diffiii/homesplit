# Households API

Module flag: none · Tasks: #26 · Contracts: [households](../../packages/contracts/src/features/households/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| DELETE | `/api/households/:householdId` | `HouseholdIdParams` | none | 204 | `owner` |

Better Auth's `/api/auth/organization/delete` answers 404, so households are deleted only through this route.

## Rules

- Server-set fields: none.
- References and eligibility: none.
- Ordering: none.
- Repeated and concurrent requests: the deletion locks the `organization` row with `SELECT … FOR UPDATE` and deletes it in the same transaction. A repeat answers 404, because the caller is no longer a member. #40 adds the settled-up check after the lock.

## Shared access checks

Every household route uses these helpers from `packages/backend/src/features/households/access`:

- `@HouseholdRoute(endpoint, { minRole })` binds the route and runs `HouseholdGuard` after the global auth guard. The guard validates `:householdId` (400), requires the caller's `member` row for that household (404), and checks `minRole`, which defaults to `member` (403). It never reads `session.activeOrganizationId`.
- `@CurrentHousehold()` gives the handler a `HouseholdContext` (`householdId`, `role`, `userId`). `userId` is the only source of the acting user.
- `assertUsersEligible(executor, householdId, refs, "current" | "party")` checks referenced users against `member` or `household_membership_history`, answering 400 `INVALID_REFERENCE` with one issue per failing path.
- `hasRole(role, minRole)` with `forbidden()` covers resource-level rights such as "author or admin+".

A path resource is loaded with its ID and `householdId` in the same `WHERE`, and an empty result throws `notFound()`, so a resource from another household answers the same 404 as a missing one.

## Errors

Shared errors from [the decision record](../decisions.md) apply. There are no feature codes.

## Storage

`household_membership_history`:

| Column | Definition |
| --- | --- |
| `organization_id` | `uuid`, FK to `organization.id`, `ON DELETE CASCADE` |
| `user_id` | `uuid`, FK to `user.id`, `ON DELETE RESTRICT` |
| `first_joined_at` | `timestamptz`, not null |

- The primary key is (`organization_id`, `user_id`).
- The `member_record_history` trigger (`AFTER INSERT ON member`) inserts the pair with `ON CONFLICT DO NOTHING`, so every Better Auth path that adds a member records it, and rejoining keeps the original `first_joined_at`. Nothing deletes a row except its household's deletion.
- Migration `0002_membership_history_trigger` backfills existing members, treating their earliest `member.created_at` as UTC (`AT TIME ZONE 'UTC'`).
- Hard-deleting a user with history fails with `23001 restrict_violation`.
