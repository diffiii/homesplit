# B16 — Implement chores and complete/reopen workflows

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B06 — Implement the household adapter and feature settings](b06-household-adapter-feature-settings.md) |
| **Blocks** | [B18 — Verify backend workflows across features and households](b18-cross-feature-verification.md) |
| **Decision owner for** | Lists and transitions ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | Storage and ordinary CRUD; then complete/reopen transitions. Concurrency and retry cases may follow in a separate PR under this issue |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Completion is a state transition with required actor/time metadata, not an ordinary writable boolean.

**Scope:** Add chore migrations, CRUD/list APIs, and complete/reopen actions with household and assignee validation.

**Acceptance criteria:**

- [ ] Persist writable metadata, optional assignee, optional UTC deadline, authenticated creator, and timestamps; validate assignees using [B01](b01-household-identity-permissions-lifecycle.md) household rules.
- [ ] Accept `dueDate` only as a nullable ISO 8601 UTC datetime stored as `timestamptz due_date`; reject date-only values. On update, omitting `dueDate` preserves the existing deadline and an explicit `null` clears it.
- [ ] Create open chores with null completion metadata; complete atomically sets actor/time, and reopen atomically clears both.
- [ ] Add a database check matching the contracted open/completed state invariant; metadata patches cannot bypass action permissions or set completion fields.
- [ ] Exclude completed chores by default, decode `includeCompleted` from raw query strings, and return deterministic paginated lists.
- [ ] Cover nullable patches, cross-household assignees, authorization/settings, repeated/concurrent transitions, rollback, and UTC datetime (`timestamptz`) round-tripping of `dueDate`.

**Evidence:**

- [chore contracts](../../packages/contracts/src/features/chores/index.ts)
- [chore storage mapping](../database-schema.md#proposed-household-data)
- [chore deadline notes](../database-schema.md#mapping-notes)
