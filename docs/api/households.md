# Households API

Module flag: none · Tasks: #26, #27 · Contracts: [households](../../packages/contracts/src/features/households/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/features` | `HouseholdIdParams` | `HouseholdFeatures` | 200 | all |
| PATCH | `/api/households/:householdId/features` | `HouseholdIdParams`, `UpdateHouseholdFeaturesRequest` | `HouseholdFeatures` | 200 | admin+ |
| DELETE | `/api/households/:householdId` | `HouseholdIdParams` | none | 204 | `owner` |

Better Auth's `/api/auth/organization/delete` answers 404, so households are deleted only through `DELETE /api/households/:householdId`.

## Rules

- Server-set fields: none.
- References and eligibility: none.
- Ordering: none.
- Partial updates: an omitted flag in `PATCH /features` stays unchanged. Concurrent patches that touch different flags compose; each issues a single `UPDATE` of only the fields it sends.
- Repeated and concurrent requests: deletion locks the `organization` row with `SELECT … FOR UPDATE` and deletes it in the same transaction. A repeat answers 404, because the caller is no longer a member. #40 adds the settled-up check after the lock, and the same task blocks turning off `expenses` while any balance in the household isn't zero.

## Shared access checks

Every household route uses these helpers from `packages/backend/src/features/households/access`:

- `@HouseholdRoute(endpoint, { minRole, module })` binds the route and runs `HouseholdGuard` after the global auth guard. The guard validates `:householdId` (400), requires the caller's `member` row for that household (404), checks whether the route's module is enabled for non-`GET` methods (403 `MODULE_DISABLED`), then checks `minRole`, which defaults to `member` (403 `FORBIDDEN`). It never reads `session.activeOrganizationId`. Pass `module` (`expenses`, `chores`, or `shopping`) on write routes for that feature area; `GET` routes ignore `module` and stay available while the module is off.
- `@CurrentHousehold()` gives the handler a `HouseholdContext` (`householdId`, `role`, `userId`). `userId` is the only source of the acting user.
- `assertUsersEligible(executor, householdId, refs, "current" | "party")` checks referenced users against `member` or `household_membership_history`, answering 400 `INVALID_REFERENCE` with one issue per failing path.
- `hasRole(role, minRole)` with `forbidden()` covers resource-level rights such as "author or admin+".

A path resource is loaded with its ID and `householdId` in the same `WHERE`, and an empty result throws `notFound()`, so a resource from another household answers the same 404 as a missing one.

The module check in the guard runs outside the handler's transaction. A write that started just before a module was turned off may still commit; #40 serializes ledger writes against balance checks separately.

## Errors

Shared errors from [the decision record](../decisions.md) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `EMPTY_PATCH` | `PATCH /features` body has no fields after parsing. |
| 409 | `HOUSEHOLD_HAS_UNSETTLED_BALANCES` | Turning off `expenses` while any balance isn't zero (#40). |

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

`household_features`:

| Column | Definition |
| --- | --- |
| `organization_id` | `uuid`, PK, FK to `organization.id`, `ON DELETE CASCADE` |
| `expenses_enabled` | `boolean`, not null, default `true` |
| `chores_enabled` | `boolean`, not null, default `true` |
| `shopping_enabled` | `boolean`, not null, default `true` |

- The `organization_seed_features` trigger (`AFTER INSERT ON organization`) inserts a row with defaults. Every Better Auth path that creates a household gets a row, including tests.
- Migration `0004_household_features_trigger` backfills existing organizations with `ON CONFLICT DO NOTHING`.
- Disabling a module changes only the flag; module data stays in place and works again when the flag is turned back on.
