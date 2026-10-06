# B09 — Implement household expense categories

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B06 — Implement the household adapter and feature settings](b06-household-adapter-feature-settings.md) |
| **Blocks** | [B11 — Add expense aggregate persistence and migrations](b11-expense-aggregate-persistence.md) |
| **Decision owner for** | — |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Expense creation needs household-scoped categories and a defined response when a referenced category is deleted.

**Scope:** Add category migrations, persistence, and CRUD/list endpoints. Choose whether deleting a referenced category rejects the operation or clears expense references; document the accepted choice.

**Acceptance criteria:**

- [ ] Persist category household, name, and nullable icon; return the contracted unpaginated list shape.
- [ ] Enforce membership, module settings, and household ownership for every operation.
- [ ] Prevent a category from one household being attached to another household's expense; expose a reusable reference check for [B12](b12-expense-crud.md).
- [ ] Specify referenced-category deletion behavior here; implement the relevant constraint/action in [B11](b11-expense-aggregate-persistence.md) and its expense integration test in [B12](b12-expense-crud.md).
- [ ] Cover validation, nullable icon patches, authorization, and migration application.

**Evidence:**

- [category contracts](../../packages/contracts/src/features/expenses/categories.ts)
- [category mapping](../database-schema.md#proposed-household-data)
