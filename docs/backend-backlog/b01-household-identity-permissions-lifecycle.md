# B01: Decide household identity, permissions, and data lifecycle

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | None |
| **Blocks** | [B02: Specify shared API conventions and error handling](b02-shared-api-conventions.md) |
| **Decision owner for** | Household identity, Permissions, Disabling a module, Financial history ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** The contracts use `householdId`, while persistence already uses organizations. Unspecified authorization and deletion behavior could produce duplicate household infrastructure or erase financial history.

**Scope:** Write a short decision record for the household/organization mapping, role matrix, feature-disable behavior, membership departure, and account/organization deletion. Currency and numeric limits belong to [B10](b10-expense-allocation.md) so the allocation engine is not blocked on lifecycle decisions. Reuse existing authentication and invitations; identify any missing application interfaces instead of inventing another auth system.

**Acceptance criteria:**

- [ ] Record the accepted identity mapping and storage location for the three feature flags.
- [ ] Define read/create/update/delete/action permissions per feature, including expense mutations, recording payments for others, and settings updates.
- [ ] Specify how departed members remain represented in historical expenses and balances. Distinguish eligibility for new expenses from payments clearing historical debt; keep retained balances settleable under the supported lifecycle.
- [ ] Specify supported user/organization deletion behavior and financial retention; explicitly prevent implicit history loss through cascades.
- [ ] Record the accepted disable-module policy and any required contract changes or decisions deferred to named feature issues.

**Evidence:**

- [schema mapping notes](../database-schema.md#mapping-notes)
- [authentication](../../packages/backend/src/auth.ts)
- [household contracts](../../packages/contracts/src/features/households/index.ts)
