# B10 — Implement deterministic expense allocation for all five methods

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | — |
| **Blocks** | [B11 — Add expense aggregate persistence and migrations](b11-expense-aggregate-persistence.md)<br>[B13 — Record settlement payments and expose payment history](b13-settlement-payments.md) |
| **Decision owner for** | Money, Allocation storage ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** The backend calculates splits, and every minor unit must be allocated consistently without losing value through rounding.

**Scope:** Record the supported currencies and numeric limits, then implement a database-independent allocation engine for equal, percentage, shares, exact, and adjustment methods. Define and document remainder ordering and numeric bounds before wiring it into persistence.

**Acceptance criteria:**

- [ ] Record supported currencies, minor-unit interpretation, numeric limits, and database/API conversion policy; [B11](b11-expense-aggregate-persistence.md) and [B13](b13-settlement-payments.md) apply them.
- [ ] Outputs use integer minor units, conserve the total exactly, and produce no negative participant share; zero shares remain valid where appropriate.
- [ ] Validate unique participants, nonempty inputs, payer totals, percentage totals of 10,000 basis points, and exact totals using shared refinements plus any necessary arithmetic safeguards.
- [ ] Apply adjustments after equally splitting the remaining total, as contracted; prevent negative shares before/after rounding.
- [ ] Use exact intermediate arithmetic and an explicit stable tie-breaker so equivalent input orderings yield identical user allocations. Reject unsupported ranges before storage or JSON conversion.
- [ ] Cover one-minor-unit totals, uneven division, all five strategies, signed adjustments, zero shares, separate payer/participant sets, reordered inputs, and boundary-sized values.

**Evidence:**

- [allocation/financial contracts](../../packages/contracts/src/features/expenses/index.ts)
- [money primitives](../../packages/contracts/src/common/money.ts)
