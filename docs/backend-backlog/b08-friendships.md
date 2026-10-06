# B08: Implement friend requests and accepted friendships

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B07: Implement authenticated profile updates and user projections](b07-profile-updates-user-projections.md) |
| **Blocks** | [B18: Verify backend workflows across features and households](b18-cross-feature-verification.md) |
| **Decision owner for** | Permissions, Lists and transitions ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | Request storage/send/lists; then acceptance/decline/removal. Concurrency and retry cases may follow in a separate PR under this issue |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Friendship storage is proposed but absent, and accepting a request must atomically change the relationship.

**Scope:** Add migrations, persistence, and user-scoped APIs for sending requests by email, incoming/sent lists, accept/decline, accepted-friend lists, and removal.

**Acceptance criteria:**

- [ ] Derive requester from the session and return the other user's projection from the authenticated user's perspective.
- [ ] Resolve normalized recipient email using the agreed unknown-recipient/privacy behavior; decide simultaneous crossed requests before implementation.
- [ ] Prevent self requests, duplicate requests, and duplicate/reversed accepted pairs with transaction-safe rules and constraints.
- [ ] Restrict accept/decline to the recipient and friendship removal to a participant; accepting removes the pending request and creates one friendship atomically.
- [ ] Keep lists unpaginated as contracted and test unauthorized actions, concurrent acceptance, retries, and rollback.

**Evidence:**

- [friend contracts](../../packages/contracts/src/features/friends/index.ts)
- [proposed friendship storage](../database-schema.md#proposed-friendships)
