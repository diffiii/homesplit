# B11 — Add expense aggregate persistence and migrations

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B09 — Implement household expense categories](b09-expense-categories.md)<br>[B10 — Implement deterministic expense allocation for all five methods](b10-expense-allocation.md) |
| **Blocks** | [B12 — Implement expense CRUD and atomic financial replacement](b12-expense-crud.md) |
| **Decision owner for** | Financial history, Allocation storage ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** An expense consists of totals, payers, allocation inputs, and calculated splits that must remain consistent as one aggregate.

**Scope:** Implement the accepted expense mapping, including categories, author, currency/date metadata, payer rows, retained allocation inputs, and calculated splits. Provide transactional repository operations used by [B12](b12-expense-crud.md).

**Acceptance criteria:**

- [ ] Use stable parent IDs and the accepted child uniqueness/composite keys; retain only strategy-relevant input fields while reconstructing a contract-equivalent allocation shape. Define participant ordering explicitly rather than assuming composite keys preserve request order.
- [ ] Add applicable foreign keys, positivity/strategy checks, and indexes for household listing and currency/member accounting; explain aggregate sums enforced in application transactions rather than simple row checks.
- [ ] Apply the agreed category deletion and financial-history policies. Expense deletion removes its children atomically without deleting unrelated payment entries.
- [ ] Reject invalid household references and duplicate child participants/payers; derive all child currency from the expense.
- [ ] Verify migration application, aggregate round trips, exact numeric/date conversion, and rollback after a child-write failure.

**Evidence:**

- [proposed expense tables](../database-schema.md#proposed-household-data)
- [expense contracts](../../packages/contracts/src/features/expenses/index.ts)
