# B13: Record settlement payments and expose payment history

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B06: Implement the household adapter and feature settings](b06-household-adapter-feature-settings.md)<br>[B10: Implement deterministic expense allocation for all five methods](b10-expense-allocation.md) |
| **Blocks** | [B14: Compute member balances separately for each currency](b14-member-balances.md) |
| **Decision owner for** | Permissions, Financial history, Payments and retries ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | If the retry/correction policy requires new contracts, review those contract changes separately before their implementation |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Payments are independent ledger entries between household users, not flags marking individual expense splits as settled.

**Scope:** Add settlement migrations, recording, and paginated history, including the agreed permission, overpayment, retry, and correction policies.

**Acceptance criteria:**

- [ ] Persist household, distinct payer/payee, strictly positive minor-unit amount/currency, nullable note, authenticated creator, and server timestamp; add constraints and history indexes.
- [ ] Enforce eligible parties, payment-recording permissions, the [B10](b10-expense-allocation.md) numeric/currency limits, and expense-module behavior.
- [ ] Do not require an expense/split reference or invoke a payment provider. Preserve attribution according to [B01](b01-household-identity-permissions-lifecycle.md).
- [ ] Document duplicate-submission and correction behavior, including whether a contract extension is required; do not silently treat identical legitimate payments as duplicates.
- [ ] Return contract-shaped payment/history responses and test authorization, invalid parties, stable pagination, rollback, and the chosen retry policy.

**Evidence:**

- [settlement contracts](../../packages/contracts/src/features/expenses/settlements.ts)
- [settlement mapping notes](../database-schema.md#mapping-notes)
