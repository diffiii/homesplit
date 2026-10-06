# B03: Integrate shared contracts with Nest request and response handling

| | |
| --- | --- |
| **Parent** | [Backend backlog proposal](../backend-backlog.md) · [delivery order](../backend-backlog.md#delivery-order) |
| **Depends on** | [B02: Specify shared API conventions and error handling](b02-shared-api-conventions.md) |
| **Blocks** | [B05: Enforce household membership and resource isolation](b05-household-membership-isolation.md)<br>[B07: Implement authenticated profile updates and user projections](b07-profile-updates-user-projections.md) |
| **Decision owner for** | None |
| **Suggested PRs** | One PR |
| **Sources** | [PR #11](https://github.com/diffiii/homesplit/pull/11) (contracts), [PR #13](https://github.com/diffiii/homesplit/pull/13) (database mapping), [issue #2](https://github.com/diffiii/homesplit/issues/2) (completed schema/contracts work) |

**Why:** TypeScript types alone do not validate incoming HTTP data, and URL queries arrive as strings.

**Scope:** Add reusable parameter/body/query validation, application error mapping, and serialization/projection helpers using the shared Zod schemas.

**Acceptance criteria:**

- [ ] Validate UUID path params, request bodies, and raw query strings; use existing integer/boolean decoders rather than JavaScript truthiness.
- [ ] Preserve defaults (`page=1`, `pageSize=20`, maximum 100) and reject malformed pagination/filter inputs.
- [ ] Support JSON on application routes while preserving Better Auth integration; bootstrap currently sets `bodyParser: false`.
- [ ] Emit contract-compatible nullable fields, date-only strings, and UTC datetimes. Provide safe integer conversion at database/API boundaries; currency-specific limits come from [B10](b10-expense-allocation.md).
- [ ] Demonstrate valid and malformed requests over HTTP and verify representative serialized responses against their schemas.

**Evidence:**

- [bootstrap](../../packages/backend/src/main.ts)
- [query decoders](../../packages/contracts/src/common/query.ts)
- [datetime primitives](../../packages/contracts/src/common/datetime.ts)
