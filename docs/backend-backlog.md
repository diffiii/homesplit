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
| Household identity | Use the Better Auth organization ID as `householdId`; reuse its membership and invitation lifecycle. Keep application feature settings in a dedicated organization-keyed table. | B01, B06 |
| Permissions | Require current household membership on every household route. Start with member access to everyday domain operations and owner/admin access to feature settings; explicitly settle expense edit/delete and payment-recording permissions. Friendship actions are user-scoped and require participant ownership. | B01, B05, B08, B13 |
| Disabling a module | Preserve data and permit authorized reads; reject new domain mutations while disabled. Agree how correction or deletion of existing financial records works under this policy. | B01, B06 |
| Financial history | Preserve prior expense/payment attribution when a member leaves. Avoid copying authentication's cascading user deletion into financial tables; choose a supported retention or anonymization strategy before enabling account/organization deletion. | B01, B11, B13 |
| Money | Use integer currency minor units, exact intermediate arithmetic, and deterministic remainder allocation. Choose supported currencies and range limits; `amountCents` does not imply every currency has two decimal places. | B10 |
| Allocation storage | Retain the submitted allocation strategy and persist calculated splits in the same transaction as payers and totals. Split rows are an implementation choice made explicit here. | B10, B11, B12 |
| Balances | Compute balances from expenses and recorded payments, separately per currency. Start without a cached balance table; measure before adding one. | B14 |
| Payments and retries | Define who can record a payment, whether overpayment is allowed, and how duplicates/corrections are handled. If these require new fields or endpoints, propose a contract change before implementing it. | B13 |
| Lists and transitions | Use deterministic ordering with an ID tie-breaker. Define empty-patch, repeated-action, and concurrent-update behavior consistently; offset pagination is stable for an unchanged dataset, not a snapshot across concurrent writes. | B02, B08, B12, B16, B17 |

For example, in one currency A pays 6,000 minor units and B pays 3,000 for an expense shared equally by A, B, and C. Each split is 3,000, so their balances are A `+3,000`, B `0`, C `-3,000`. A recorded payment of 3,000 from C to A makes all balances zero. An expense or payment in another currency cannot offset this debt.

## Delivery order

Each feature issue defines and documents its own routes, status codes, and permissions following the B02 conventions, and includes its own migration, authorization, contract, and invariant tests where applicable. B18 verifies assembled workflows; it is not a reason to postpone feature testing. Dependencies below are completion prerequisites, not restrictions on when investigation or a draft implementation can begin. Only direct dependencies are listed; transitive prerequisites are implied.

| ID | Proposed GitHub issue title | Depends on |
| --- | --- | --- |
| B01 | Decide household identity, permissions, and data lifecycle | — |
| B02 | Specify shared API conventions and error handling | B01 |
| B03 | Integrate shared contracts with Nest request and response handling | B02 |
| B04 | Add a PostgreSQL integration-test and migration workflow | — |
| B05 | Enforce household membership and resource isolation | B03, B04 |
| B06 | Implement the household adapter and feature settings | B05 |
| B07 | Implement authenticated profile updates and user projections | B03, B04 |
| B08 | Implement friend requests and accepted friendships | B07 |
| B09 | Implement household expense categories | B06 |
| B10 | Implement deterministic expense allocation for all five methods | — |
| B11 | Add expense aggregate persistence and migrations | B09, B10 |
| B12 | Implement expense CRUD and atomic financial replacement | B11 |
| B13 | Record settlement payments and expose payment history | B06, B10 |
| B14 | Compute member balances separately for each currency | B12, B13 |
| B15 | Generate deterministic settlement suggestions | B14 |
| B16 | Implement chores and complete/reopen workflows | B06 |
| B17 | Implement shopping and purchase/clear workflows | B06 |
| B18 | Verify backend workflows across features and households | B08, B15, B16, B17 |

Start B01, B04, and B10 together, then the API foundation and household access work. After that, profiles/friends, chores, shopping, and financial work can proceed independently. The longest financial chain is B09 → B11 → B12 → B14 → B15; B10 and B13 can be developed alongside the earlier steps. Avoid merging consumers of new contracts ahead of the agreed contract version.

An issue may be delivered through multiple focused PRs. Each PR includes the tests needed for its behavior; the issue closes once all acceptance criteria are met. Suggested boundaries for the larger issues:

| Issue | Suggested PR boundaries |
| --- | --- |
| B08, friendships | Request storage/send/lists; then acceptance/decline/removal and concurrency behavior |
| B12, expense CRUD | Create/get/list; then financial replacement/edit/delete |
| B13, settlements | If the retry/correction policy requires new contracts, review those contract changes separately before their implementation |
| B16, chores | Storage and ordinary CRUD; then complete/reopen transitions |
| B17, shopping | Storage and ordinary CRUD; then purchase/unpurchase/clear |
| B18, verification | Financial end-to-end scenario; then non-financial and second-household isolation scenarios; then the documentation status update |

For B08, B16, and B17, concurrency and retry cases may land in a follow-up PR under the same issue when review bandwidth is limited. The financial issues keep them with the behavior they protect. B10 isolates allocation arithmetic, B11 owns aggregate persistence, and B14/B15 separate balances from suggestions; all five allocation methods form one coherent review while the engine stays independent of HTTP and persistence.

## Proposed issue descriptions

### B01 — Decide household identity, permissions, and data lifecycle

**Why:** The contracts use `householdId`, while persistence already uses organizations. Unspecified authorization and deletion behavior could produce duplicate household infrastructure or erase financial history.

**Scope:** Write a short decision record for the household/organization mapping, role matrix, feature-disable behavior, membership departure, and account/organization deletion. Currency and numeric limits belong to B10 so the allocation engine is not blocked on lifecycle decisions. Reuse existing authentication and invitations; identify any missing application interfaces instead of inventing another auth system.

**Acceptance criteria:**

- Record the accepted identity mapping and storage location for the three feature flags.
- Define read/create/update/delete/action permissions per feature, including expense mutations, recording payments for others, and settings updates.
- Specify how departed members remain represented in historical expenses and balances. Distinguish eligibility for new expenses from payments clearing historical debt; keep retained balances settleable under the supported lifecycle.
- Specify supported user/organization deletion behavior and financial retention; explicitly prevent implicit history loss through cascades.
- Record the accepted disable-module policy and any required contract changes or decisions deferred to named feature issues.

**Depends on:** None. **Evidence:** [schema mapping notes](database-schema.md#mapping-notes), [authentication](../packages/backend/src/auth.ts), [household contracts](../packages/contracts/src/features/households/index.ts).

### B02 — Specify shared API conventions and error handling

**Why:** Shared schemas do not tell frontend and backend authors which URL shapes, status codes, or authorization errors to expect. Writing the full route matrix up front would create a long review that is likely to churn once implementation starts.

**Scope:** Define the conventions every application route follows. Each feature issue then defines and documents its own routes against these conventions.

**Acceptance criteria:**

- Define the URL shape for household-scoped and user-scoped routes and a short template for documenting each feature's routes, schemas, permissions, and responses.
- Define invalid input, unauthenticated, forbidden, missing resource, conflict, empty patch, and delete responses using the shared `ApiError` envelope for application routes.
- Specify deterministic list ordering and pagination metadata; preserve the contracted defaults and unpaginated response families.
- Explain how application errors and route conventions coexist with Better Auth's own endpoints and responses, including whether household lifecycle operations need wrappers.
- Leave repeated-action, concurrent-update, and mutation-retry policy to the owning feature issue. Identify missing contracts without silently extending the public API.

**Depends on:** B01. **Evidence:** [API errors](../packages/contracts/src/common/api-error.ts), [pagination](../packages/contracts/src/common/pagination.ts), [contract exports](../packages/contracts/src/index.ts).

### B03 — Integrate shared contracts with Nest request and response handling

**Why:** TypeScript types alone do not validate incoming HTTP data, and URL queries arrive as strings.

**Scope:** Add reusable parameter/body/query validation, application error mapping, and serialization/projection helpers using the shared Zod schemas.

**Acceptance criteria:**

- Validate UUID path params, request bodies, and raw query strings; use existing integer/boolean decoders rather than JavaScript truthiness.
- Preserve defaults (`page=1`, `pageSize=20`, maximum 100) and reject malformed pagination/filter inputs.
- Support JSON on application routes while preserving Better Auth integration; bootstrap currently sets `bodyParser: false`.
- Emit contract-compatible nullable fields, date-only strings, and UTC datetimes. Provide safe integer conversion at database/API boundaries; currency-specific limits come from B10.
- Demonstrate valid and malformed requests over HTTP and verify representative serialized responses against their schemas.

**Depends on:** B02. **Evidence:** [bootstrap](../packages/backend/src/main.ts), [query decoders](../packages/contracts/src/common/query.ts), [datetime primitives](../packages/contracts/src/common/datetime.ts).

### B04 — Add a PostgreSQL integration-test and migration workflow

**Why:** The backend has no test script, and transactions, constraints, and auth integration need verification against the real database.

**Scope:** Add a repeatable local/CI backend test command with an isolated PostgreSQL database, migrations, fixture helpers, and cleanup. Keep tests independent of a developer's normal database.

**Acceptance criteria:**

- Migrate an empty database and exercise the existing auth/organization schema and status endpoint.
- Support authenticated users in two households and unauthenticated requests without sharing mutable fixtures between tests.
- Demonstrate transaction rollback and clean isolation between test runs; use a disposable database or an explicit test-only database configuration.
- Document the local command and wire it into CI. Include migration generation/application instructions compatible with the chosen Drizzle workflow.
- Make it straightforward for each feature issue to add real persistence, constraint, and authorization coverage.

**Depends on:** None. **Evidence:** [backend scripts](../packages/backend/package.json), [database connection](../packages/backend/src/db/index.ts), [initial migration](../packages/backend/src/db/migrations/0000_petite_spyke.sql), [CI](../.github/workflows/ci.yml).

### B05 — Enforce household membership and resource isolation

**Why:** A valid resource UUID or a session's active organization does not prove authorization to that household.

**Scope:** Provide reusable authentication, role, membership, and household-scoped resource checks for application routes and services.

**Acceptance criteria:**

- Derive the acting user from the session, never a client-supplied author/completer/creator ID.
- Check membership for the requested `householdId`; do not treat nullable `session.activeOrganizationId` as proof of access.
- Apply the B01 role matrix and reject references to another household's resources, categories, or ineligible participants.
- Verify nonmembers, removed members, forged actor fields, and mismatched household/resource IDs through HTTP tests.
- Document where reference checks and transactions must cooperate to prevent membership/resource changes from invalidating a write.

**Depends on:** B03, B04. **Evidence:** [member and session tables](../packages/backend/src/db/schema.ts), [household data mapping](database-schema.md#proposed-household-data).

### B06 — Implement the household adapter and feature settings

**Why:** Household-scoped APIs need a consistent bridge to existing organizations and persisted module settings.

**Scope:** Implement the agreed organization/household adapter and feature-setting storage/API. Reuse Better Auth lifecycle endpoints unless B02 explicitly requires a wrapper.

**Acceptance criteria:**

- Existing and newly created organizations receive `expenses`, `chores`, and `shopping` settings defaulting to enabled, with no duplicate household identity.
- Partial settings updates preserve unspecified flags and enforce the agreed settings role restriction.
- Provide a shared enabled-module check and test the agreed read/mutation behavior after disable/re-enable.
- Preserve module data across toggles according to B01 and cover organization creation/invitation/member removal integration.
- Audit membership-pair uniqueness and plugin compatibility before changing generated auth tables; address any migration/backfill implications explicitly.

**Depends on:** B05. **Evidence:** [household features](../packages/contracts/src/features/households/index.ts), [feature catalog](../packages/contracts/src/features/catalog.ts), [organization plugin](../packages/backend/src/auth.ts).

### B07 — Implement authenticated profile updates and user projections

**Why:** Domain responses reuse compact user projections, but the implemented avatar field is named `image` and the contract uses `imageUrl`.

**Scope:** Implement the current-user profile update and shared `UserSummary`/`FriendUser` projections.

**Acceptance criteria:**

- Update only the authenticated user's display name/avatar; support partial updates and explicit avatar clearing with `null`.
- Map `image` to `imageUrl` consistently, including existing users and nullable avatars.
- Validate request and response shapes; reject attempts to target another account or update authentication-owned fields.
- Include email only in the authorized `FriendUser` contexts rather than every nested user summary.
- Test persistence and serialization through HTTP, including the agreed empty-patch behavior.

**Depends on:** B03, B04. **Evidence:** [user contracts](../packages/contracts/src/features/users/index.ts), [friend user projection](../packages/contracts/src/features/friends/index.ts), [user persistence](../packages/backend/src/db/schema.ts).

### B08 — Implement friend requests and accepted friendships

**Why:** Friendship storage is proposed but absent, and accepting a request must atomically change the relationship.

**Scope:** Add migrations, persistence, and user-scoped APIs for sending requests by email, incoming/sent lists, accept/decline, accepted-friend lists, and removal.

**Acceptance criteria:**

- Derive requester from the session and return the other user's projection from the authenticated user's perspective.
- Resolve normalized recipient email using the agreed unknown-recipient/privacy behavior; decide simultaneous crossed requests before implementation.
- Prevent self requests, duplicate requests, and duplicate/reversed accepted pairs with transaction-safe rules and constraints.
- Restrict accept/decline to the recipient and friendship removal to a participant; accepting removes the pending request and creates one friendship atomically.
- Keep lists unpaginated as contracted and test unauthorized actions, concurrent acceptance, retries, and rollback.

**Depends on:** B07. **Evidence:** [friend contracts](../packages/contracts/src/features/friends/index.ts), [proposed friendship storage](database-schema.md#proposed-friendships).

### B09 — Implement household expense categories

**Why:** Expense creation needs household-scoped categories and a defined response when a referenced category is deleted.

**Scope:** Add category migrations, persistence, and CRUD/list endpoints. Choose whether deleting a referenced category rejects the operation or clears expense references; document the accepted choice.

**Acceptance criteria:**

- Persist category household, name, and nullable icon; return the contracted unpaginated list shape.
- Enforce membership, module settings, and household ownership for every operation.
- Prevent a category from one household being attached to another household's expense; expose a reusable reference check for B12.
- Specify referenced-category deletion behavior here; implement the relevant constraint/action in B11 and its expense integration test in B12.
- Cover validation, nullable icon patches, authorization, and migration application.

**Depends on:** B06. **Evidence:** [category contracts](../packages/contracts/src/features/expenses/categories.ts), [category mapping](database-schema.md#proposed-household-data).

### B10 — Implement deterministic expense allocation for all five methods

**Why:** The backend calculates splits, and every minor unit must be allocated consistently without losing value through rounding.

**Scope:** Record the supported currencies and numeric limits, then implement a database-independent allocation engine for equal, percentage, shares, exact, and adjustment methods. Define and document remainder ordering and numeric bounds before wiring it into persistence.

**Acceptance criteria:**

- Record supported currencies, minor-unit interpretation, numeric limits, and database/API conversion policy; B11 and B13 apply them.
- Outputs use integer minor units, conserve the total exactly, and produce no negative participant share; zero shares remain valid where appropriate.
- Validate unique participants, nonempty inputs, payer totals, percentage totals of 10,000 basis points, and exact totals using shared refinements plus any necessary arithmetic safeguards.
- Apply adjustments after equally splitting the remaining total, as contracted; prevent negative shares before/after rounding.
- Use exact intermediate arithmetic and an explicit stable tie-breaker so equivalent input orderings yield identical user allocations. Reject unsupported ranges before storage or JSON conversion.
- Cover one-minor-unit totals, uneven division, all five strategies, signed adjustments, zero shares, separate payer/participant sets, reordered inputs, and boundary-sized values.

**Depends on:** None. **Evidence:** [allocation/financial contracts](../packages/contracts/src/features/expenses/index.ts), [money primitives](../packages/contracts/src/common/money.ts).

### B11 — Add expense aggregate persistence and migrations

**Why:** An expense consists of totals, payers, allocation inputs, and calculated splits that must remain consistent as one aggregate.

**Scope:** Implement the accepted expense mapping, including categories, author, currency/date metadata, payer rows, retained allocation inputs, and calculated splits. Provide transactional repository operations used by B12.

**Acceptance criteria:**

- Use stable parent IDs and the accepted child uniqueness/composite keys; retain only strategy-relevant input fields while reconstructing a contract-equivalent allocation shape. Define participant ordering explicitly rather than assuming composite keys preserve request order.
- Add applicable foreign keys, positivity/strategy checks, and indexes for household listing and currency/member accounting; explain aggregate sums enforced in application transactions rather than simple row checks.
- Apply the agreed category deletion and financial-history policies. Expense deletion removes its children atomically without deleting unrelated payment entries.
- Reject invalid household references and duplicate child participants/payers; derive all child currency from the expense.
- Verify migration application, aggregate round trips, exact numeric/date conversion, and rollback after a child-write failure.

**Depends on:** B09, B10. **Evidence:** [proposed expense tables](database-schema.md#proposed-household-data), [expense contracts](../packages/contracts/src/features/expenses/index.ts).

### B12 — Implement expense CRUD and atomic financial replacement

**Why:** Metadata may be patched independently, but updating only part of an expense's financial state would invalidate balances.

**Scope:** Add create/get/list/update/delete endpoints using the allocation engine and aggregate repository.

**Acceptance criteria:**

- Derive author/timestamps server-side and validate payers, participants, and categories against the requested household and B01 lifecycle rules.
- Allow multiple payers independently of allocation participants; calculate splits server-side rather than accepting client-calculated rows.
- Replace total, payers, allocation input, and calculated splits together when `financial` is supplied. Descriptive-only updates preserve all financial state.
- Return complete contract-shaped aggregates and a deterministic paginated expense list; enforce mutation roles and disabled-module behavior.
- Cover create/edit/delete effects, invalid financial replacement, cross-household references, rollback, and concurrent replacement according to the policy documented in this issue. Add the category-deletion integration case identified in B09.

**Depends on:** B11. **Evidence:** [create/update/list expense contracts](../packages/contracts/src/features/expenses/index.ts).

### B13 — Record settlement payments and expose payment history

**Why:** Payments are independent ledger entries between household users, not flags marking individual expense splits as settled.

**Scope:** Add settlement migrations, recording, and paginated history, including the agreed permission, overpayment, retry, and correction policies.

**Acceptance criteria:**

- Persist household, distinct payer/payee, strictly positive minor-unit amount/currency, nullable note, authenticated creator, and server timestamp; add constraints and history indexes.
- Enforce eligible parties, payment-recording permissions, the B10 numeric/currency limits, and expense-module behavior.
- Do not require an expense/split reference or invoke a payment provider. Preserve attribution according to B01.
- Document duplicate-submission and correction behavior, including whether a contract extension is required; do not silently treat identical legitimate payments as duplicates.
- Return contract-shaped payment/history responses and test authorization, invalid parties, stable pagination, rollback, and the chosen retry policy.

**Depends on:** B06, B10. **Evidence:** [settlement contracts](../packages/contracts/src/features/expenses/settlements.ts), [settlement mapping notes](database-schema.md#mapping-notes).

### B14 — Compute member balances separately for each currency

**Why:** Multi-payer expenses and payments require consistent ledger signs, and currencies cannot be netted together.

**Scope:** Implement the unpaginated balance endpoint from persisted expense payers/splits and settlement payments.

**Acceptance criteria:**

- Per user/currency, calculate `expense contributions - allocated shares + payments sent - payments received`; positive means owed money and negative means owing money.
- Group output by currency and conserve a zero sum in each group. Specify deterministic ordering, zero-balance inclusion, and empty-household behavior.
- Include historical members according to B01 rather than hiding their outstanding debt or credit.
- Use a consistent database read for one response and safe exact aggregation at numeric boundaries; avoid multiplying totals through joins between child tables.
- Verify the worked example above, multiple payers, users outside allocation, multiple currencies, expense edit/delete, repeated payments, and the adopted correction policy.

**Depends on:** B12, B13. **Evidence:** [balance contracts and sign convention](../packages/contracts/src/features/expenses/settlements.ts), [computed-response mapping](database-schema.md#mapping-notes).

### B15 — Generate deterministic settlement suggestions

**Why:** Members need actionable transfers that clear current debt without mixing currencies or creating payment records automatically.

**Scope:** Implement unpaginated suggestions from B14 balances using a documented deterministic debtor/creditor matching algorithm.

**Acceptance criteria:**

- Suggest only strictly positive transfers between distinct users, from negative-balance debtors to positive-balance creditors, within one currency group; every suggested party must be eligible for payment recording under B01/B13, including supported historical members.
- Applying the suggested transfers clears every balance in that currency without changing the currency total.
- Specify stable ordering and tie-breaking; verify repeated runs and reordered equivalent inputs produce identical results.
- Return the contracted currency-grouped response and handle empty/zero balances and multiple currencies.
- Document algorithm complexity and avoid promising a globally minimal transfer count; suggestions do not persist or execute payments.

**Depends on:** B14. **Evidence:** [suggestion contracts](../packages/contracts/src/features/expenses/settlements.ts).

### B16 — Implement chores and complete/reopen workflows

**Why:** Completion is a state transition with required actor/time metadata, not an ordinary writable boolean.

**Scope:** Add chore migrations, CRUD/list APIs, and complete/reopen actions with household and assignee validation.

**Acceptance criteria:**

- Persist writable metadata, optional assignee, optional UTC deadline, authenticated creator, and timestamps; validate assignees using B01 household rules.
- Accept `dueDate` only as a nullable ISO 8601 UTC datetime stored as `timestamptz due_date`; reject date-only values. On update, omitting `dueDate` preserves the existing deadline and an explicit `null` clears it.
- Create open chores with null completion metadata; complete atomically sets actor/time, and reopen atomically clears both.
- Add a database check matching the contracted open/completed state invariant; metadata patches cannot bypass action permissions or set completion fields.
- Exclude completed chores by default, decode `includeCompleted` from raw query strings, and return deterministic paginated lists.
- Cover nullable patches, cross-household assignees, authorization/settings, repeated/concurrent transitions, rollback, and UTC datetime (`timestamptz`) round-tripping of `dueDate`.

**Depends on:** B06. **Evidence:** [chore contracts](../packages/contracts/src/features/chores/index.ts), [chore storage mapping](database-schema.md#proposed-household-data), [chore deadline notes](database-schema.md#mapping-notes).

### B17 — Implement shopping and purchase/clear workflows

**Why:** Purchased items require consistent actor/time metadata, and clearing a list must delete only the household's purchased items.

**Scope:** Add shopping migrations, CRUD/list APIs, purchase/unpurchase actions, and clear-purchased behavior.

**Acceptance criteria:**

- Persist name, quantity, nullable unit, authenticated creator, and added timestamp; quantity defaults to one and remains at least one.
- Create unpurchased items with null purchase metadata; purchase sets actor/time atomically, and unpurchase clears both.
- Add a database check matching the contracted purchase-state invariant; ordinary updates cannot bypass the action boundary.
- Exclude purchased items by default and decode `includePurchased` correctly; return deterministic paginated lists.
- Clear only purchased items in the requested household and return the actual nonnegative `deletedCount`. Define/test its interaction with concurrent purchase/unpurchase, plus repeated actions, access/settings, and rollback.

**Depends on:** B06. **Evidence:** [shopping contracts](../packages/contracts/src/features/shopping/index.ts), [shopping storage mapping](database-schema.md#proposed-household-data).

### B18 — Verify backend workflows across features and households

**Why:** Passing individual feature tests does not demonstrate that assembled workflows preserve household isolation and financial invariants.

**Scope:** Add focused end-to-end scenarios and document the implementation status against the feature route documentation and proposed schema. Reuse feature coverage instead of duplicating it.

**Acceptance criteria:**

- Exercise sign-in/household membership, profile projections, friendship acceptance, module settings, chore completion/reopen, and shopping purchase/clear through the actual HTTP application.
- Exercise category/expense creation, all five allocations, financial replacement, currency-separated balances, payment recording/history, and suggestions in a complete financial scenario.
- Use a second household to demonstrate that IDs, participant references, settings, lists, and mutations cannot leak across household boundaries.
- Verify departed-member/history behavior, disabled-module policy, applicable concurrency/retry scenarios, and representative response schemas at integration boundaries.
- Apply migrations to an empty database, run the backend suite in CI, and update docs to distinguish implemented decisions from remaining proposals. Record deferred contract gaps without expanding scope.

**Depends on:** B08, B15, B16, B17. **Evidence:** [route/contract inventory](../packages/contracts/src/index.ts), [schema document](database-schema.md), [CI](../.github/workflows/ci.yml).

## Turning this proposal into GitHub issues

Review the scope and proposed directions first. Then create one issue per B01–B18 using its title, rationale, scope, acceptance criteria, and dependencies. Replace document IDs with real issue links after creation and link back to this proposal and the source PRs. The backlog follows the completed issue #2 rather than reopening it as a backend implementation umbrella.

Accept each policy before reviewing the implementation that depends on it: B01's permissions, departed-member settlement eligibility, and deletion/retention rules, and B13's retry/correction semantics. Feature-specific decisions can stay with their named owners if they are settled before that implementation. Keep migrations with the feature that owns them except for B11's expense aggregate, and resolve policy/contract gaps before their dependent implementation. This PR proposes the backlog; it does not create the issues or implement runtime behavior.
