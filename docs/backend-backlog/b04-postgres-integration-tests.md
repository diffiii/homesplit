# B04 — Add a PostgreSQL integration-test and migration workflow

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | — |
| **Blocks** | [B05 — Enforce household membership and resource isolation](b05-household-membership-isolation.md)<br>[B07 — Implement authenticated profile updates and user projections](b07-profile-updates-user-projections.md) |
| **Decision owner for** | — |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** The backend has no test script, and transactions, constraints, and auth integration need verification against the real database.

**Scope:** Add a repeatable local/CI backend test command with an isolated PostgreSQL database, migrations, fixture helpers, and cleanup. Keep tests independent of a developer's normal database.

**Acceptance criteria:**

- [ ] Migrate an empty database and exercise the existing auth/organization schema and status endpoint.
- [ ] Support authenticated users in two households and unauthenticated requests without sharing mutable fixtures between tests.
- [ ] Demonstrate transaction rollback and clean isolation between test runs; use a disposable database or an explicit test-only database configuration.
- [ ] Document the local command and wire it into CI. Include migration generation/application instructions compatible with the chosen Drizzle workflow.
- [ ] Make it straightforward for each feature issue to add real persistence, constraint, and authorization coverage.

**Evidence:**

- [backend scripts](../../packages/backend/package.json)
- [database connection](../../packages/backend/src/db/index.ts)
- [initial migration](../../packages/backend/src/db/migrations/0000_petite_spyke.sql)
- [CI](../../.github/workflows/ci.yml)
