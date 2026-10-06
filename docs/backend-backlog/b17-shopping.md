# B17 — Implement shopping and purchase/clear workflows

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B06 — Implement the household adapter and feature settings](b06-household-adapter-feature-settings.md) |
| **Blocks** | [B18 — Verify backend workflows across features and households](b18-cross-feature-verification.md) |
| **Decision owner for** | Lists and transitions ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | Storage and ordinary CRUD; then purchase/unpurchase/clear. Concurrency and retry cases may follow in a separate PR under this issue |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Purchased items require consistent actor/time metadata, and clearing a list must delete only the household's purchased items.

**Scope:** Add shopping migrations, CRUD/list APIs, purchase/unpurchase actions, and clear-purchased behavior.

**Acceptance criteria:**

- [ ] Persist name, quantity, nullable unit, authenticated creator, and added timestamp; quantity defaults to one and remains at least one.
- [ ] Create unpurchased items with null purchase metadata; purchase sets actor/time atomically, and unpurchase clears both.
- [ ] Add a database check matching the contracted purchase-state invariant; ordinary updates cannot bypass the action boundary.
- [ ] Exclude purchased items by default and decode `includePurchased` correctly; return deterministic paginated lists.
- [ ] Clear only purchased items in the requested household and return the actual nonnegative `deletedCount`. Define/test its interaction with concurrent purchase/unpurchase, plus repeated actions, access/settings, and rollback.

**Evidence:**

- [shopping contracts](../../packages/contracts/src/features/shopping/index.ts)
- [shopping storage mapping](../database-schema.md#proposed-household-data)
