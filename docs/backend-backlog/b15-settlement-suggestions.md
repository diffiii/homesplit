# B15 — Generate deterministic settlement suggestions

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B14 — Compute member balances separately for each currency](b14-member-balances.md) |
| **Blocks** | [B18 — Verify backend workflows across features and households](b18-cross-feature-verification.md) |
| **Decision owner for** | — |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Members need actionable transfers that clear current debt without mixing currencies or creating payment records automatically.

**Scope:** Implement unpaginated suggestions from [B14](b14-member-balances.md) balances using a documented deterministic debtor/creditor matching algorithm.

**Acceptance criteria:**

- [ ] Suggest only strictly positive transfers between distinct users, from negative-balance debtors to positive-balance creditors, within one currency group; every suggested party must be eligible for payment recording under [B01](b01-household-identity-permissions-lifecycle.md)/[B13](b13-settlement-payments.md), including supported historical members.
- [ ] Applying the suggested transfers clears every balance in that currency without changing the currency total.
- [ ] Specify stable ordering and tie-breaking; verify repeated runs and reordered equivalent inputs produce identical results.
- [ ] Return the contracted currency-grouped response and handle empty/zero balances and multiple currencies.
- [ ] Document algorithm complexity and avoid promising a globally minimal transfer count; suggestions do not persist or execute payments.

**Evidence:**

- [suggestion contracts](../../packages/contracts/src/features/expenses/settlements.ts)
