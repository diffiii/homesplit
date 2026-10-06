# B12: Implement expense CRUD and atomic financial replacement

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B11: Add expense aggregate persistence and migrations](b11-expense-aggregate-persistence.md) |
| **Blocks** | [B14: Compute member balances separately for each currency](b14-member-balances.md) |
| **Decision owner for** | Allocation storage, Lists and transitions ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | Create/get/list; then financial replacement/edit/delete |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Metadata may be patched independently, but updating only part of an expense's financial state would invalidate balances.

**Scope:** Add create/get/list/update/delete endpoints using the allocation engine and aggregate repository.

**Acceptance criteria:**

- [ ] Derive author/timestamps server-side and validate payers, participants, and categories against the requested household and [B01](b01-household-identity-permissions-lifecycle.md) lifecycle rules.
- [ ] Allow multiple payers independently of allocation participants; calculate splits server-side rather than accepting client-calculated rows.
- [ ] Replace total, payers, allocation input, and calculated splits together when `financial` is supplied. Descriptive-only updates preserve all financial state.
- [ ] Return complete contract-shaped aggregates and a deterministic paginated expense list; enforce mutation roles and disabled-module behavior.
- [ ] Cover create/edit/delete effects, invalid financial replacement, cross-household references, rollback, and concurrent replacement according to the policy documented in this issue. Add the category-deletion integration case identified in [B09](b09-expense-categories.md).

**Evidence:**

- [create/update/list expense contracts](../../packages/contracts/src/features/expenses/index.ts)
