# B14 — Compute member balances separately for each currency

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B12 — Implement expense CRUD and atomic financial replacement](b12-expense-crud.md)<br>[B13 — Record settlement payments and expose payment history](b13-settlement-payments.md) |
| **Blocks** | [B15 — Generate deterministic settlement suggestions](b15-settlement-suggestions.md) |
| **Decision owner for** | Balances ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Multi-payer expenses and payments require consistent ledger signs, and currencies cannot be netted together.

**Scope:** Implement the unpaginated balance endpoint from persisted expense payers/splits and settlement payments.

**Acceptance criteria:**

- [ ] Per user/currency, calculate `expense contributions - allocated shares + payments sent - payments received`; positive means owed money and negative means owing money.
- [ ] Group output by currency and conserve a zero sum in each group. Specify deterministic ordering, zero-balance inclusion, and empty-household behavior.
- [ ] Include historical members according to [B01](b01-household-identity-permissions-lifecycle.md) rather than hiding their outstanding debt or credit.
- [ ] Use a consistent database read for one response and safe exact aggregation at numeric boundaries; avoid multiplying totals through joins between child tables.
- [ ] Verify the [worked example](../backend-backlog.md#proposed-design-decisions), multiple payers, users outside allocation, multiple currencies, expense edit/delete, repeated payments, and the adopted correction policy.

**Evidence:**

- [balance contracts and sign convention](../../packages/contracts/src/features/expenses/settlements.ts)
- [computed-response mapping](../database-schema.md#mapping-notes)
