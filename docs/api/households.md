# Households API

Module flag: none · Tasks: #26, #27, #41, #93 · Contracts: [households](../../packages/contracts/src/features/households/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/features` | `HouseholdIdParams` | `HouseholdFeatures` | 200 | all |
| PATCH | `/api/households/:householdId/features` | `HouseholdIdParams`, `UpdateHouseholdFeaturesRequest` | `HouseholdFeatures` | 200 | admin+ |
| DELETE | `/api/households/:householdId` | `HouseholdIdParams` | none | 204 | `owner` |
| GET | `/api/invitations/:invitationId` | `InvitationIdParams` | `InvitationPreview` | 200 | any signed-in user |

Better Auth's `/api/auth/organization/delete` answers 404, so households are deleted only through `DELETE /api/households/:householdId`.

## Rules

- Server-set fields: none.
- References and eligibility: none.
- Ordering: none.
- Partial updates: an omitted flag in `PATCH /features` stays unchanged. Concurrent patches that touch different flags compose; each issues a single `UPDATE` of only the fields it sends.
- Repeated and concurrent requests: deletion locks the `organization` row with `SELECT … FOR UPDATE` and deletes it in the same transaction. A repeat answers 404, because the caller is no longer a member.

## Invitation preview

`GET /api/invitations/:invitationId` is what the invitation page shows before the invitee answers through Better Auth's `accept-invitation` or `reject-invitation`. Better Auth's `get-invitation` can't serve it: it answers 403 without the address to a user signed in with another email, and the same 400 to expired, cancelled, and answered invitations.

- Any signed-in user may read any invitation, so the page can tell someone signed in with the wrong account which address the invitation is for. The ID is a random UUID that only the invitation email links to, so knowing it is what lets a user read it. It shows the household's ID and name, the inviter's `UserSummary`, the invited address, and the role. A visitor who isn't signed in gets 401, and an unknown ID 404.
- `status` is Better Auth's stored status (`pending`, `accepted`, `rejected`, or `canceled`), except that a `pending` invitation whose `expiresAt` has passed is `expired`, as Better Auth refuses it then. An invitation replaced by a newer one to the same address is `canceled` (see [Better Auth endpoints](../decisions.md#better-auth-endpoints)).
- `role` is the strongest HomeSplit role in the stored value, or `member` when none is stored, which is the role Better Auth grants then.
- Reading changes nothing, so the answer can be out of date by the time the invitee answers; Better Auth checks again when they do.

## Settled-up checks

A household is settled up when every party's balance in every currency is zero, departed members' included; only confirmed payments count. Three changes require it:

| Change | Requires | Otherwise |
| --- | --- | --- |
| `DELETE /api/households/:householdId` | The whole household settled up | 409 `HOUSEHOLD_HAS_UNSETTLED_BALANCES` |
| `PATCH /features` with `expenses: false` | The whole household settled up | 409 `HOUSEHOLD_HAS_UNSETTLED_BALANCES`; no flag in the patch changes |
| Better Auth `/organization/leave` | The leaving member's own balances zero | 409 `UNSETTLED_BALANCE` |

- Deleting and turning off `expenses` call `assertHouseholdSettledUp` from `packages/backend/src/features/expenses/household-ledger-lock.ts` inside their transaction. It locks the `organization` row `FOR UPDATE` and then reads the balances. Every ledger write holds the same row `FOR SHARE` until it commits, so the check waits for writes in progress and sees them, and later writes wait until the change is done. A patch that leaves `expenses` alone or turns it on isn't checked.
- Leaving is checked in the global `hooks.before` in `packages/backend/src/auth.ts`, matched on `/organization/leave`, because that endpoint calls no organization hook. The check runs before Better Auth's write and outside any transaction with it, so an expense committed in between can leave the member departed with a balance. That's accepted, as in the [decision record](../decisions.md#departed-members). Only the caller's balances count, so other members' debts never block them. The hook also answers 400 `VALIDATION_ERROR` to an `organizationId` that isn't a UUID, which Better Auth would otherwise pass to a `uuid` column and answer with 500. A missing `organizationId` or session is left to Better Auth.
- All three use `hasUnsettledBalances` from `packages/backend/src/features/expenses/balances/balances.repository.ts`, the same ledger as the [balance routes](expenses.md#balances), which stops at the first non-zero balance.

## Shared access checks

Every household route uses these helpers from `packages/backend/src/features/households/access`:

- `@HouseholdRoute(endpoint, { minRole, module })` binds the route and runs `HouseholdGuard` after the global auth guard. The guard validates `:householdId` (400), requires the caller's `member` row for that household (404), checks whether the route's module is enabled for non-`GET` methods (403 `MODULE_DISABLED`), then checks `minRole`, which defaults to `member` (403 `FORBIDDEN`). It never reads `session.activeOrganizationId`. Pass `module` (`expenses`, `chores`, or `shopping`) on write routes for that feature area; `ai` is checked by `AiService` on every call instead (see [AI provider](../decisions.md#ai-provider)); `GET` routes ignore `module` and stay available while the module is off.
- `@CurrentHousehold()` gives the handler a `HouseholdContext` (`householdId`, `role`, `userId`). `userId` is the only source of the acting user.
- `assertUsersEligible(executor, householdId, refs, "current" | "party")` checks referenced users against `member` or `household_membership_history`, answering 400 `INVALID_REFERENCE` with one issue per failing path.
- `hasRole(role, minRole)` with `forbidden()` covers resource-level rights such as "author or admin+".

A path resource is loaded with its ID and `householdId` in the same `WHERE`, and an empty result throws `notFound()`, so a resource from another household answers the same 404 as a missing one.

The module check in the guard runs outside the handler's transaction. A write that started just before a module was turned off may still commit; ledger writes are serialized against the settled-up check separately (see [Settled-up checks](#settled-up-checks)).

## Errors

Shared errors from [the decision record](../decisions.md) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `EMPTY_PATCH` | `PATCH /features` body has no fields after parsing. |
| 400 | `VALIDATION_ERROR` | `/api/auth/organization/leave` with an `organizationId` that isn't a UUID, in Better Auth's error body. |
| 409 | `HOUSEHOLD_HAS_UNSETTLED_BALANCES` | Deleting the household or turning off `expenses` while any balance isn't zero. |
| 409 | `UNSETTLED_BALANCE` | `/api/auth/organization/leave` while any of the caller's balances in the household isn't zero, in Better Auth's error body. |

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
| `ai_enabled` | `boolean`, not null, default `false`; households opt in (see [AI provider](../decisions.md#ai-provider)) |

- The `organization_seed_features` trigger (`AFTER INSERT ON organization`) inserts a row with defaults. Every Better Auth path that creates a household gets a row, including tests.
- Migration `0004_household_features_trigger` backfills existing organizations with `ON CONFLICT DO NOTHING`.
- Disabling a module changes only the flag; module data stays in place and works again when the flag is turned back on.
