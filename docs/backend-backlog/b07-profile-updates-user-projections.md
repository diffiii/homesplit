# B07 — Implement authenticated profile updates and user projections

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B03 — Integrate shared contracts with Nest request and response handling](b03-contract-request-response-handling.md)<br>[B04 — Add a PostgreSQL integration-test and migration workflow](b04-postgres-integration-tests.md) |
| **Blocks** | [B08 — Implement friend requests and accepted friendships](b08-friendships.md) |
| **Decision owner for** | — |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Domain responses reuse compact user projections, but the implemented avatar field is named `image` and the contract uses `imageUrl`.

**Scope:** Implement the current-user profile update and shared `UserSummary`/`FriendUser` projections.

**Acceptance criteria:**

- [ ] Update only the authenticated user's display name/avatar; support partial updates and explicit avatar clearing with `null`.
- [ ] Map `image` to `imageUrl` consistently, including existing users and nullable avatars.
- [ ] Validate request and response shapes; reject attempts to target another account or update authentication-owned fields.
- [ ] Include email only in the authorized `FriendUser` contexts rather than every nested user summary.
- [ ] Test persistence and serialization through HTTP, including the agreed empty-patch behavior.

**Evidence:**

- [user contracts](../../packages/contracts/src/features/users/index.ts)
- [friend user projection](../../packages/contracts/src/features/friends/index.ts)
- [user persistence](../../packages/backend/src/db/schema.ts)
