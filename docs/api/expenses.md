# Expenses API

Module flag: `expenses` · Tasks: #35, #40 · Contracts: [expenses](../../packages/contracts/src/features/expenses/index.ts), [categories](../../packages/contracts/src/features/expenses/categories.ts), [settlements](../../packages/contracts/src/features/expenses/settlements.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/expense-categories` | `HouseholdIdParams` | `ExpenseCategoryListResponse` | 200 | all |
| POST | `/api/households/:householdId/expense-categories` | `HouseholdIdParams`, `CreateExpenseCategoryRequest` | `ExpenseCategory` | 201 | admin+ |
| PATCH | `/api/households/:householdId/expense-categories/:categoryId` | `ExpenseCategoryIdParams`, `UpdateExpenseCategoryRequest` | `ExpenseCategory` | 200 | admin+ |
| DELETE | `/api/households/:householdId/expense-categories/:categoryId` | `ExpenseCategoryIdParams` | none | 204 | admin+ |
| GET | `/api/households/:householdId/settlements` | `HouseholdIdParams`, `ListSettlementHistoryQuery` | `SettlementListResponse` | 200 | all |
| POST | `/api/households/:householdId/settlements` | `HouseholdIdParams`, `ProcessSettlementRequest` | `Settlement` | 201 | party or admin+ |
| POST | `/api/households/:householdId/settlements/:settlementId/confirm` | `SettlementIdParams` | `ConfirmedSettlement` | 200 | payee, or admin+ who isn't the payer |
| DELETE | `/api/households/:householdId/settlements/:settlementId` | `SettlementIdParams` | none | 204 | pending only: party or admin+ |

In the settlement rows, a party is the payer or the payee, as in the [permission matrix](../decisions.md#roles-and-permissions). Every current member passes the route-level check, and the service checks the party rule, answering 403 `FORBIDDEN`.

## Rules

### Categories

- Server-set fields: `id` and `householdId`. The household always comes from the URL; both fields are stripped from request bodies.
- Icons: `icon` is a single emoji ([`Emoji`](../../packages/contracts/src/common/emoji.ts)) or `null`, and clients show it as the category's avatar. One emoji means one visible character, so skin tones, flags, keycaps, and joined sequences such as 👨‍👩‍👧 pass, while text and several emoji in a row fail with 400 `VALIDATION_ERROR`.
- Partial updates: in `PATCH`, an omitted field stays unchanged and `icon: null` clears the icon. `name` can't be `null`.
- Names: any non-empty string. Two categories in a household may share a name.
- References and eligibility: none in these routes. Routes that take a `categoryId` in the body call `assertCategoryInHousehold(executor, householdId, categoryId, path?)` from `packages/backend/src/features/expense-categories/category-reference.ts`. A missing category and another household's both answer 400 `INVALID_REFERENCE`, with `path` (default `["categoryId"]`) in `details.issues`.
- Ordering: categories are listed by name ascending, ignoring case, then by `id`. The list is unpaginated.
- Default categories: a new household starts with Groceries 🛒, Utilities 💡, Rent 🏠, Transport 🚗, Dining out 🍽️, Entertainment 🎬, and Other 📦. They're ordinary rows that an admin+ can rename or delete. Households that existed before #35 get none.
- Repeated and concurrent requests: `POST` isn't idempotent, so a repeat creates a second category. A repeated `DELETE` answers 404. #37 adds the check that keeps a category in use from being deleted.

#### Seeding default categories

Better Auth's `organizationHooks.afterCreateOrganization` in `packages/backend/src/auth.ts` calls `seedDefaultCategories`. Unlike `household_features` and `household_membership_history`, which [triggers keep in sync](../decisions.md#keeping-derived-tables-in-sync), default categories aren't an invariant: nothing breaks when a household has none. That makes the hook's limits acceptable:

- It runs after Better Auth has written the household and outside any transaction with it. A failure is logged and swallowed, so `/organization/create` still succeeds and the household starts with no categories.
- It runs only for `/organization/create`. An `organization` row inserted any other way gets no defaults.

The defaults live in `DEFAULT_CATEGORIES` in `default-categories.ts`, so changing them doesn't need a migration.

### Settlements

A payment is an independent ledger entry. It references no expense or split, so editing or deleting an expense never touches it.

- Server-set fields: `id`, `householdId`, `createdBy`, `createdAt`, `status`, `confirmedBy`, and `confirmedAt`. `ProcessSettlementRequest` is strict, so sending any of them answers 400 `VALIDATION_ERROR`.
- References and eligibility: `payerId` and `payeeId` are distinct [household parties](../decisions.md#membership-history), checked with `assertUsersEligible(tx, householdId, refs, "party")`. That's one lookup in `household_membership_history` and never reads balances, so a departed member's debt can be settled before #41 exists. The recorder's right is checked first: a member recording a payment between two other users gets 403 `FORBIDDEN`, whoever those users are.
- Status: a payment recorded by its payer is `pending`. Any other is `confirmed` at once, with the recorder as `confirmedBy` and `confirmedAt` equal to `createdAt`. Only confirmed payments count toward balances.
- Amounts: `amount.amountCents` is a positive integer up to `MAX_AMOUNT_CENTS` in any [supported currency](../money.md#supported-currencies). The currency doesn't have to match an existing expense.
- Notes: an omitted `note` is stored as `null`.
- Ordering: `createdAt` descending, then `id` descending. `createdAt` is the database's time when the recording transaction started.
- Disabled module: `GET /settlements` keeps working. The other three routes answer 403 `MODULE_DISABLED`.

#### Overpayment

Payments aren't checked against balances. A payment may be larger than what the payer owes, and may be recorded between parties who owe each other nothing. It moves both balances by its amount, so an overpayment shows up as a debt in the other direction.

- A balance changes whenever an expense is added, edited, or deleted. A limit would reject a real payment because of an expense somebody hasn't entered yet, or accept one that a later edit turns into an overpayment anyway.
- [Writing off a debt by splitting it](../decisions.md#writing-off-debts) records payments from the debtor to members the debtor doesn't owe.

So #41 has no balance-based restriction to implement.

#### Repeated requests

`POST /settlements` isn't idempotent, and the contracts have no idempotency key. Every accepted request adds one entry with its own `id`. Two requests with the same parties, amount, currency, and note are two payments, however close together they arrive: paying the same person the same amount twice is ordinary, and the server can't tell that from a retry.

Clients therefore don't resend a `POST /settlements` whose answer they didn't receive. They refetch the history first and resend only if the payment isn't there. A duplicate that got through is handled as a [correction](#corrections).

- `POST /settlements/:settlementId/confirm` is idempotent. Confirming a confirmed payment answers 200 with the payment unchanged, keeping the original `confirmedBy` and `confirmedAt`. The caller still needs the right to confirm, so the payer gets 403 either way.
- A repeated `DELETE` answers 404.

#### Corrections

There's no route that edits a payment.

- A pending payment is deleted and recorded again. The payer withdraws it, or the payee or an admin+ rejects it. Nothing remains in the history.
- A confirmed payment is permanent: `DELETE` answers 409 `SETTLEMENT_CONFIRMED`. It's corrected with a second payment in the opposite direction, either for the full amount, followed by the right payment, or for the difference alone. The `note` says what it corrects. Both entries stay in the history.

A reversal follows the ordinary recording rules. The original payee is its payer, so it's pending when they record it themselves, and confirmed at once when the original payer or an admin+ records it.

#### Concurrent requests

Every transaction that writes a payment first locks the household's `organization` row `FOR SHARE` with `lockHouseholdForLedgerWrite` from `packages/backend/src/features/expenses/household-ledger-lock.ts`, as [the decision record](../decisions.md#deleting-households) requires of every ledger write. A write that waited for a household's deletion answers 404.

Confirming and deleting also lock the payment's row `FOR UPDATE`. When both arrive together, the second one sees the first one's result: a confirmation after a deletion answers 404, and a deletion after a confirmation answers 409.

A page of the history and its `totalItems` are read in one read-only `REPEATABLE READ` transaction (`readSnapshot` in `packages/backend/src/db/index.ts`).

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `EMPTY_PATCH` | `PATCH /expense-categories/:categoryId` body has no fields after parsing. |
| 400 | `INVALID_REFERENCE` | A `categoryId` in a request body isn't a category of this household (#37). |
| 400 | `INVALID_REFERENCE` | `payerId` or `payeeId` has never been a member of this household. `details.issues` has one entry per failing field. |
| 403 | `FORBIDDEN` | Recording a payment between two other users, or deleting one, without being admin+. Confirming a payment as its payer, or as a member who isn't its payee. |
| 409 | `CATEGORY_IN_USE` | Deleting a category that an expense uses (#37). |
| 409 | `SETTLEMENT_CONFIRMED` | Deleting a confirmed payment. |

## Storage

`expense_categories`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `name` | `text`, not null |
| `icon` | `text`, nullable; a single emoji |

- `expense_categories_household_id_idx` indexes `household_id` for the list.
- The emoji rule is enforced by the contract schema, not by a database constraint.
- Deleting a household deletes its categories.

`settlements`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `payer_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |
| `payee_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |
| `created_by_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |
| `amount_cents` | `bigint`, not null |
| `currency` | `text`, not null |
| `note` | `text`, nullable |
| `created_at` | `timestamptz`, not null, default `now()` |
| `confirmed_by_id` | `uuid`, nullable, FK to `user.id`, `ON DELETE RESTRICT` |
| `confirmed_at` | `timestamptz`, nullable |

- There's no status column. A payment is pending while `confirmed_at` is null, and `settlements_confirmation` keeps `confirmed_by_id` and `confirmed_at` either both null or both set.
- `settlements_payer_party_fk` and `settlements_payee_party_fk` reference `household_membership_history` (`organization_id`, `user_id`) from (`household_id`, `payer_id`) and (`household_id`, `payee_id`), so a party from another household can't be stored.
- Checks: `settlements_distinct_parties` (`payer_id <> payee_id`), `settlements_amount_positive` (`amount_cents > 0`), `settlements_currency_code` (three capital letters), and `settlements_note_not_empty`. The amount limit and the list of supported currencies are enforced by the contract schema only.
- `settlements_history_idx` on (`household_id`, `created_at`, `id`) serves the history, read backward.
- Deleting a household deletes its payments.
