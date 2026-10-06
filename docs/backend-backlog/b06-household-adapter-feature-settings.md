# B06: Implement the household adapter and feature settings

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B05: Enforce household membership and resource isolation](b05-household-membership-isolation.md) |
| **Blocks** | [B09: Implement household expense categories](b09-expense-categories.md)<br>[B13: Record settlement payments and expose payment history](b13-settlement-payments.md)<br>[B16: Implement chores and complete/reopen workflows](b16-chores.md)<br>[B17: Implement shopping and purchase/clear workflows](b17-shopping.md) |
| **Decision owner for** | Household identity, Disabling a module ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Household-scoped APIs need a consistent bridge to existing organizations and persisted module settings.

**Scope:** Implement the agreed organization/household adapter and feature-setting storage/API. Reuse Better Auth lifecycle endpoints unless [B02](b02-shared-api-conventions.md) explicitly requires a wrapper.

**Acceptance criteria:**

- [ ] Existing and newly created organizations receive `expenses`, `chores`, and `shopping` settings defaulting to enabled, with no duplicate household identity.
- [ ] Partial settings updates preserve unspecified flags and enforce the agreed settings role restriction.
- [ ] Provide a shared enabled-module check and test the agreed read/mutation behavior after disable/re-enable.
- [ ] Preserve module data across toggles according to [B01](b01-household-identity-permissions-lifecycle.md) and cover organization creation/invitation/member removal integration.
- [ ] Audit membership-pair uniqueness and plugin compatibility before changing generated auth tables; address any migration/backfill implications explicitly.

**Evidence:**

- [household features](../../packages/contracts/src/features/households/index.ts)
- [feature catalog](../../packages/contracts/src/features/catalog.ts)
- [organization plugin](../../packages/backend/src/auth.ts)
