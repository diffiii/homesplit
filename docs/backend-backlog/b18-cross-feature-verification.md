# B18 — Verify backend workflows across features and households

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B08 — Implement friend requests and accepted friendships](b08-friendships.md)<br>[B15 — Generate deterministic settlement suggestions](b15-settlement-suggestions.md)<br>[B16 — Implement chores and complete/reopen workflows](b16-chores.md)<br>[B17 — Implement shopping and purchase/clear workflows](b17-shopping.md) |
| **Blocks** | — |
| **Decision owner for** | — |
| **Suggested PRs** | Financial end-to-end scenario; then non-financial and second-household isolation scenarios; then the documentation status update |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Passing individual feature tests does not demonstrate that assembled workflows preserve household isolation and financial invariants.

**Scope:** Add focused end-to-end scenarios and document the implementation status against the feature route documentation and proposed schema. Reuse feature coverage instead of duplicating it.

**Acceptance criteria:**

- [ ] Exercise sign-in/household membership, profile projections, friendship acceptance, module settings, chore completion/reopen, and shopping purchase/clear through the actual HTTP application.
- [ ] Exercise category/expense creation, all five allocations, financial replacement, currency-separated balances, payment recording/history, and suggestions in a complete financial scenario.
- [ ] Use a second household to demonstrate that IDs, participant references, settings, lists, and mutations cannot leak across household boundaries.
- [ ] Verify departed-member/history behavior, disabled-module policy, applicable concurrency/retry scenarios, and representative response schemas at integration boundaries.
- [ ] Apply migrations to an empty database, run the backend suite in CI, and update docs to distinguish implemented decisions from remaining proposals. Record deferred contract gaps without expanding scope.

**Evidence:**

- [route/contract inventory](../../packages/contracts/src/index.ts)
- [schema document](../database-schema.md)
- [CI](../../.github/workflows/ci.yml)
