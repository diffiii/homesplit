# B05: Enforce household membership and resource isolation

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B03: Integrate shared contracts with Nest request and response handling](b03-contract-request-response-handling.md)<br>[B04: Add a PostgreSQL integration-test and migration workflow](b04-postgres-integration-tests.md) |
| **Blocks** | [B06: Implement the household adapter and feature settings](b06-household-adapter-feature-settings.md) |
| **Decision owner for** | Permissions ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** A valid resource UUID or a session's active organization does not prove authorization to that household.

**Scope:** Provide reusable authentication, role, membership, and household-scoped resource checks for application routes and services.

**Acceptance criteria:**

- [ ] Derive the acting user from the session, never a client-supplied author/completer/creator ID.
- [ ] Check membership for the requested `householdId`; do not treat nullable `session.activeOrganizationId` as proof of access.
- [ ] Apply the [B01](b01-household-identity-permissions-lifecycle.md) role matrix and reject references to another household's resources, categories, or ineligible participants.
- [ ] Verify nonmembers, removed members, forged actor fields, and mismatched household/resource IDs through HTTP tests.
- [ ] Document where reference checks and transactions must cooperate to prevent membership/resource changes from invalidating a write.

**Evidence:**

- [member and session tables](../../packages/backend/src/db/schema.ts)
- [household data mapping](../database-schema.md#proposed-household-data)
