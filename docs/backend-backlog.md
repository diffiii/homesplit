# Backend backlog proposal

This proposal turns the API contracts merged in [PR #11](https://github.com/diffiii/homesplit/pull/11) and the database mapping merged in [PR #13](https://github.com/diffiii/homesplit/pull/13) into **18 proposed GitHub issues**. It covers the backend needed to deliver the contracted features. The issue descriptions below are ready to copy into GitHub after review; `B01`–`B18` are document identifiers, not existing issue numbers.

## Starting point and boundaries

The research baseline is `main` at `11fb20e`, after both source PRs merged: PR #11 at head `3b95c3c` (merged as `162ac3a`) and PR #13 at head `b6d99f7` (merged as `11fb20e`). The baseline includes #13's final change of chore `dueDate` to a UTC datetime. The schema/contracts work tracked by [issue #2](https://github.com/diffiii/homesplit/issues/2) is complete; these proposals address the implementation that follows it.

The [backend](../packages/backend/src) already has NestJS, PostgreSQL/Drizzle, Better Auth email/password authentication, and its organization plugin. The [implemented schema](../packages/backend/src/db/schema.ts) contains users, sessions, accounts, verification, organizations, members, and invitations. The application controller currently exposes only an anonymous status endpoint. Application tables, domain services, controllers, and a backend test workflow still need implementation.

The [database document](database-schema.md) separates implemented tables from proposed application mappings. Its household mapping, SQL types, composite keys, and deletion policies are design inputs rather than completed migrations. Similarly, the [shared contracts](../packages/contracts/src/index.ts) define payloads and validation, but do not establish routes, role permissions, transaction boundaries, rounding, or household lifecycle behavior.

The scope is profiles, friendships, household module settings, expenses/categories, balances/settlements, chores, and shopping. Notifications have an [empty contract placeholder](../packages/contracts/src/features/notifications/index.ts) and are deferred. Recurrence, reminders, budgets, currency conversion, payment-provider transfers, and automatic shopping-to-expense conversion have no contracts and are also deferred. Recording a settlement means recording a payment made outside HomeSplit.

## Proposed design decisions

These are directions for review, not claims about existing behavior. B01 records the accepted cross-cutting decisions, B02 the shared API conventions, and B10 the currency and numeric limits; feature issues resolve their narrower policies. Each policy must be accepted before review of the implementation that depends on it begins, so storage and APIs are not redesigned during code review.

| Topic | Proposed direction | Decision owner |
| --- | --- | --- |
| Household identity | Use the Better Auth organization ID as `householdId`; reuse its membership and invitation lifecycle. Keep application feature settings in a dedicated organization-keyed table. | [B01](backend-backlog/b01-household-identity-permissions-lifecycle.md), [B06](backend-backlog/b06-household-adapter-feature-settings.md) |
| Permissions | Require current household membership on every household route. Start with member access to everyday domain operations and owner/admin access to feature settings; explicitly settle expense edit/delete and payment-recording permissions. Friendship actions are user-scoped and require participant ownership. | [B01](backend-backlog/b01-household-identity-permissions-lifecycle.md), [B05](backend-backlog/b05-household-membership-isolation.md), [B08](backend-backlog/b08-friendships.md), [B13](backend-backlog/b13-settlement-payments.md) |
| Disabling a module | Preserve data and permit authorized reads; reject new domain mutations while disabled. Agree how correction or deletion of existing financial records works under this policy. | [B01](backend-backlog/b01-household-identity-permissions-lifecycle.md), [B06](backend-backlog/b06-household-adapter-feature-settings.md) |
| Financial history | Preserve prior expense/payment attribution when a member leaves. Avoid copying authentication's cascading user deletion into financial tables; choose a supported retention or anonymization strategy before enabling account/organization deletion. | [B01](backend-backlog/b01-household-identity-permissions-lifecycle.md), [B11](backend-backlog/b11-expense-aggregate-persistence.md), [B13](backend-backlog/b13-settlement-payments.md) |
| Money | Use integer currency minor units, exact intermediate arithmetic, and deterministic remainder allocation. Choose supported currencies and range limits; `amountCents` does not imply every currency has two decimal places. | [B10](backend-backlog/b10-expense-allocation.md) |
| Allocation storage | Retain the submitted allocation strategy and persist calculated splits in the same transaction as payers and totals. Split rows are an implementation choice made explicit here. | [B10](backend-backlog/b10-expense-allocation.md), [B11](backend-backlog/b11-expense-aggregate-persistence.md), [B12](backend-backlog/b12-expense-crud.md) |
| Balances | Compute balances from expenses and recorded payments, separately per currency. Start without a cached balance table; measure before adding one. | [B14](backend-backlog/b14-member-balances.md) |
| Payments and retries | Define who can record a payment, whether overpayment is allowed, and how duplicates/corrections are handled. If these require new fields or endpoints, propose a contract change before implementing it. | [B13](backend-backlog/b13-settlement-payments.md) |
| Lists and transitions | Use deterministic ordering with an ID tie-breaker. Define empty-patch, repeated-action, and concurrent-update behavior consistently; offset pagination is stable for an unchanged dataset, not a snapshot across concurrent writes. | [B02](backend-backlog/b02-shared-api-conventions.md), [B08](backend-backlog/b08-friendships.md), [B12](backend-backlog/b12-expense-crud.md), [B16](backend-backlog/b16-chores.md), [B17](backend-backlog/b17-shopping.md) |

For example, in one currency A pays 6,000 minor units and B pays 3,000 for an expense shared equally by A, B, and C. Each split is 3,000, so their balances are A `+3,000`, B `0`, C `-3,000`. A recorded payment of 3,000 from C to A makes all balances zero. An expense or payment in another currency cannot offset this debt.

## Delivery order

Each feature issue defines and documents its own routes, status codes, and permissions following the B02 conventions, and includes its own migration, authorization, contract, and invariant tests where applicable. B18 verifies assembled workflows; it is not a reason to postpone feature testing. Dependencies below are completion prerequisites, not restrictions on when investigation or a draft implementation can begin. Only direct dependencies are listed; transitive prerequisites are implied.

| ID | Proposed GitHub issue title | Depends on |
| --- | --- | --- |
| [B01](backend-backlog/b01-household-identity-permissions-lifecycle.md) | Decide household identity, permissions, and data lifecycle | None |
| [B02](backend-backlog/b02-shared-api-conventions.md) | Specify shared API conventions and error handling | [B01](backend-backlog/b01-household-identity-permissions-lifecycle.md) |
| [B03](backend-backlog/b03-contract-request-response-handling.md) | Integrate shared contracts with Nest request and response handling | [B02](backend-backlog/b02-shared-api-conventions.md) |
| [B04](backend-backlog/b04-postgres-integration-tests.md) | Add a PostgreSQL integration-test and migration workflow | None |
| [B05](backend-backlog/b05-household-membership-isolation.md) | Enforce household membership and resource isolation | [B03](backend-backlog/b03-contract-request-response-handling.md), [B04](backend-backlog/b04-postgres-integration-tests.md) |
| [B06](backend-backlog/b06-household-adapter-feature-settings.md) | Implement the household adapter and feature settings | [B05](backend-backlog/b05-household-membership-isolation.md) |
| [B07](backend-backlog/b07-profile-updates-user-projections.md) | Implement authenticated profile updates and user projections | [B03](backend-backlog/b03-contract-request-response-handling.md), [B04](backend-backlog/b04-postgres-integration-tests.md) |
| [B08](backend-backlog/b08-friendships.md) | Implement friend requests and accepted friendships | [B07](backend-backlog/b07-profile-updates-user-projections.md) |
| [B09](backend-backlog/b09-expense-categories.md) | Implement household expense categories | [B06](backend-backlog/b06-household-adapter-feature-settings.md) |
| [B10](backend-backlog/b10-expense-allocation.md) | Implement deterministic expense allocation for all five methods | None |
| [B11](backend-backlog/b11-expense-aggregate-persistence.md) | Add expense aggregate persistence and migrations | [B09](backend-backlog/b09-expense-categories.md), [B10](backend-backlog/b10-expense-allocation.md) |
| [B12](backend-backlog/b12-expense-crud.md) | Implement expense CRUD and atomic financial replacement | [B11](backend-backlog/b11-expense-aggregate-persistence.md) |
| [B13](backend-backlog/b13-settlement-payments.md) | Record settlement payments and expose payment history | [B06](backend-backlog/b06-household-adapter-feature-settings.md), [B10](backend-backlog/b10-expense-allocation.md) |
| [B14](backend-backlog/b14-member-balances.md) | Compute member balances separately for each currency | [B12](backend-backlog/b12-expense-crud.md), [B13](backend-backlog/b13-settlement-payments.md) |
| [B15](backend-backlog/b15-settlement-suggestions.md) | Generate deterministic settlement suggestions | [B14](backend-backlog/b14-member-balances.md) |
| [B16](backend-backlog/b16-chores.md) | Implement chores and complete/reopen workflows | [B06](backend-backlog/b06-household-adapter-feature-settings.md) |
| [B17](backend-backlog/b17-shopping.md) | Implement shopping and purchase/clear workflows | [B06](backend-backlog/b06-household-adapter-feature-settings.md) |
| [B18](backend-backlog/b18-cross-feature-verification.md) | Verify backend workflows across features and households | [B08](backend-backlog/b08-friendships.md), [B15](backend-backlog/b15-settlement-suggestions.md), [B16](backend-backlog/b16-chores.md), [B17](backend-backlog/b17-shopping.md) |

Start B01, B04, and B10 together, then the API foundation and household access work. After that, profiles/friends, chores, shopping, and financial work can proceed independently. The longest financial chain is B09 → B11 → B12 → B14 → B15; B10 and B13 can be developed alongside the earlier steps. Avoid merging consumers of new contracts ahead of the agreed contract version.

An issue may be delivered through multiple focused PRs. Each PR includes the tests needed for its behavior; the issue closes once all acceptance criteria are met. Suggested boundaries for the larger issues:

| Issue | Suggested PR boundaries |
| --- | --- |
| [B08](backend-backlog/b08-friendships.md), friendships | Request storage/send/lists; then acceptance/decline/removal and concurrency behavior |
| [B12](backend-backlog/b12-expense-crud.md), expense CRUD | Create/get/list; then financial replacement/edit/delete |
| [B13](backend-backlog/b13-settlement-payments.md), settlements | If the retry/correction policy requires new contracts, review those contract changes separately before their implementation |
| [B16](backend-backlog/b16-chores.md), chores | Storage and ordinary CRUD; then complete/reopen transitions |
| [B17](backend-backlog/b17-shopping.md), shopping | Storage and ordinary CRUD; then purchase/unpurchase/clear |
| [B18](backend-backlog/b18-cross-feature-verification.md), verification | Financial end-to-end scenario; then non-financial and second-household isolation scenarios; then the documentation status update |

For B08, B16, and B17, concurrency and retry cases may land in a follow-up PR under the same issue when review bandwidth is limited. The financial issues keep them with the behavior they protect. B10 isolates allocation arithmetic, B11 owns aggregate persistence, and B14/B15 separate balances from suggestions; all five allocation methods form one coherent review while the engine stays independent of HTTP and persistence.

## Proposed issue descriptions

Each issue has its own file in [`backend-backlog/`](backend-backlog) so it can be reviewed separately. Every file starts with its parent, direct dependencies, the issues it blocks, the design decisions it owns, suggested PR boundaries, and source links, followed by the rationale, scope, acceptance criteria, and evidence.

## Turning this proposal into GitHub issues

Review the scope and proposed directions first. Then create one issue per file in [`backend-backlog/`](backend-backlog), using its heading as the title and the rest as the body. Replace document IDs and relative links with real issue and `main` links after creation, and link back to this proposal and the source PRs. The backlog follows the completed issue #2 rather than reopening it as a backend implementation umbrella.

Accept each policy before reviewing the implementation that depends on it: B01's permissions, departed-member settlement eligibility, and deletion/retention rules, and B13's retry/correction semantics. Feature-specific decisions can stay with their named owners if they are settled before that implementation. Keep migrations with the feature that owns them except for B11's expense aggregate, and resolve policy/contract gaps before their dependent implementation. This PR proposes the backlog; it does not create the issues or implement runtime behavior.
