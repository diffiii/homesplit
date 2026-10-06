# B02: Specify shared API conventions and error handling

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B01: Decide household identity, permissions, and data lifecycle](b01-household-identity-permissions-lifecycle.md) |
| **Blocks** | [B03: Integrate shared contracts with Nest request and response handling](b03-contract-request-response-handling.md) |
| **Decision owner for** | Lists and transitions ([design decisions](../backend-backlog.md#proposed-design-decisions)) |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** Shared schemas do not tell frontend and backend authors which URL shapes, status codes, or authorization errors to expect. Writing the full route matrix up front would create a long review that is likely to churn once implementation starts.

**Scope:** Define the conventions every application route follows. Each feature issue then defines and documents its own routes against these conventions.

**Acceptance criteria:**

- [ ] Define the URL shape for household-scoped and user-scoped routes and a short template for documenting each feature's routes, schemas, permissions, and responses.
- [ ] Define invalid input, unauthenticated, forbidden, missing resource, conflict, empty patch, and delete responses using the shared `ApiError` envelope for application routes.
- [ ] Specify deterministic list ordering and pagination metadata; preserve the contracted defaults and unpaginated response families.
- [ ] Explain how application errors and route conventions coexist with Better Auth's own endpoints and responses, including whether household lifecycle operations need wrappers.
- [ ] Leave repeated-action, concurrent-update, and mutation-retry policy to the owning feature issue. Identify missing contracts without silently extending the public API.

**Evidence:**

- [API errors](../../packages/contracts/src/common/api-error.ts)
- [pagination](../../packages/contracts/src/common/pagination.ts)
- [contract exports](../../packages/contracts/src/index.ts)
