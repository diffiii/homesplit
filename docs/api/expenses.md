# Expenses API

Module flag: `expenses` · Tasks: #35, #37, #40 · Contracts: [expenses](../../packages/contracts/src/features/expenses/index.ts), [categories](../../packages/contracts/src/features/expenses/categories.ts), [settlements](../../packages/contracts/src/features/expenses/settlements.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/expense-categories` | `HouseholdIdParams` | `ExpenseCategoryListResponse` | 200 | all |
| POST | `/api/households/:householdId/expense-categories` | `HouseholdIdParams`, `CreateExpenseCategoryRequest` | `ExpenseCategory` | 201 | admin+ |
| PATCH | `/api/households/:householdId/expense-categories/:categoryId` | `ExpenseCategoryIdParams`, `UpdateExpenseCategoryRequest` | `ExpenseCategory` | 200 | admin+ |
| DELETE | `/api/households/:householdId/expense-categories/:categoryId` | `ExpenseCategoryIdParams` | none | 204 | admin+ |
| GET | `/api/households/:householdId/expenses` | `HouseholdIdParams`, `ListExpensesQuery` | `ExpenseListResponse` | 200 | all |
| POST | `/api/households/:householdId/expenses` | `HouseholdIdParams`, `CreateExpenseRequest` | `Expense` | 201 | all |
| GET | `/api/households/:householdId/expenses/:expenseId` | `ExpenseIdParams` | `Expense` | 200 | all |
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
- Categories in use: deleting a category that any expense uses answers 409 `CATEGORY_IN_USE`, and the category stays. The service checks for such an expense first. An expense committed after that check makes `expenses_category_fk` reject the delete, which answers the generic 409 `CONFLICT`. Deleting the household still deletes both.
- Repeated and concurrent requests: `POST` isn't idempotent, so a repeat creates a second category. A repeated `DELETE` answers 404.

#### Seeding default categories

Better Auth's `organizationHooks.afterCreateOrganization` in `packages/backend/src/auth.ts` calls `seedDefaultCategories`. Unlike `household_features` and `household_membership_history`, which [triggers keep in sync](../decisions.md#keeping-derived-tables-in-sync), default categories aren't an invariant: nothing breaks when a household has none. That makes the hook's limits acceptable:

- It runs after Better Auth has written the household and outside any transaction with it. A failure is logged and swallowed, so `/organization/create` still succeeds and the household starts with no categories.
- It runs only for `/organization/create`. An `organization` row inserted any other way gets no defaults.

The defaults live in `DEFAULT_CATEGORIES` in `default-categories.ts`, so changing them doesn't need a migration.

### Expenses

- Server-set fields: `id`, `householdId`, `author`, `splits`, `createdAt`, and `updatedAt`. The author is the caller. `CreateExpenseRequest` is strict, so sending any of them answers 400 `VALIDATION_ERROR`.
- Splits: the server calculates them with `allocate` from `@homesplit/contracts`, the same engine clients run. They're non-negative, so a participant can owe 0, and add up to the total, as the payers do.
- Payers and participants are independent: a payer needn't take part, and a participant needn't pay. A user appears at most once in each list; a duplicate answers 400 `VALIDATION_ERROR` at its path, such as `["payers", 1, "userId"]`.
- References and eligibility: payers and participants must be [current members](../decisions.md#referenced-users), checked with `assertUsersEligible(tx, householdId, refs, "current")` at the paths `["payers", i, "userId"]` and `["allocation", "participants", i, "userId"]`. A `categoryId` must be one of this household's categories. Either failure answers 400 `INVALID_REFERENCE`.
- Currency: every amount is in `total.currency`.
- Optional fields: an omitted `description` or `categoryId` is stored as `null`.
- Reading back: payers, allocation participants, and splits come back sorted by user ID, not in the order sent. A departed member still shows as author, payer, or participant. Another household's expense answers 404, as a missing one does.
- Ordering: `expenseDate` descending, then `createdAt` descending, then `id` descending. A page past the end has no items and the real `totalItems`.
- Disabled module: both `GET` routes keep working, and `POST` answers 403 `MODULE_DISABLED`.
- Repeated requests: `POST` isn't idempotent, so a repeat creates a second expense.

#### Writing and reading

`create` runs in one transaction: it locks the household with `lockHouseholdForLedgerWrite`, checks the payers, participants, and category, calculates the splits, and writes the expense and its child rows. A failure at any step stores nothing, and a write that waited for a household's deletion answers 404. A category deleted between the check and the write makes `expenses_category_fk` reject the insert, which answers the generic 409 `CONFLICT`.

`packages/backend/src/features/expenses/expenses/expenses.repository.ts` holds the queries. `insertFinancialRows` writes the payers, participants, and splits, so a financial replacement (#38) can reuse it. `findExpenses` reads expenses with their author, category, and child rows in one relational query (`db.query.expenses`), using the relations at the end of `packages/backend/src/db/schema/expenses.ts`. A page of the list and its `totalItems` are read in one `readSnapshot`.

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
| 400 | `INVALID_REFERENCE` | A `categoryId` in a request body isn't a category of this household. |
| 400 | `INVALID_REFERENCE` | An expense payer or participant isn't a current member of this household. `details.issues` has one entry per failing user. |
| 400 | `INVALID_REFERENCE` | `payerId` or `payeeId` has never been a member of this household. `details.issues` has one entry per failing field. |
| 403 | `FORBIDDEN` | Recording a payment between two other users, or deleting one, without being admin+. Confirming a payment as its payer, or as a member who isn't its payee. |
| 409 | `CATEGORY_IN_USE` | Deleting a category that an expense uses. |
| 409 | `SETTLEMENT_CONFIRMED` | Deleting a confirmed payment. |

## Storage

`expense_categories`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `name` | `text`, not null |
| `icon` | `text`, nullable; a single emoji |

- `expense_categories_household_id_id_key`, unique on (`household_id`, `id`), serves the list and is the target of `expenses_category_fk`.
- The emoji rule is enforced by the contract schema, not by a database constraint.
- Deleting a household deletes its categories.

`expenses`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `name` | `text`, not null |
| `description` | `text`, nullable |
| `total_amount_cents` | `bigint`, not null |
| `currency` | `text`, not null; every child row's amounts are in it |
| `allocation_method` | `text`, not null: `equal`, `percentage`, `shares`, `exact`, or `adjustment` |
| `author_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |
| `category_id` | `uuid`, nullable |
| `expense_date` | `date`, not null |
| `created_at` | `timestamptz`, not null, default `now()` |
| `updated_at` | `timestamptz`, not null, default `now()` |

- `expenses_category_fk` references `expense_categories` (`household_id`, `id`) from (`household_id`, `category_id`), `ON DELETE RESTRICT`, so a category from another household can't be stored and one in use can't be deleted. A null `category_id` isn't checked.
- `expenses_author_party_fk` references `household_membership_history` from (`household_id`, `author_id`).
- Checks: `expenses_total_amount_positive` (`total_amount_cents > 0`), `expenses_currency_code` (three capital letters), `expenses_allocation_method`, `expenses_name_not_empty`, and `expenses_description_not_empty`. The amount limit and the list of supported currencies are enforced by the contract schema only.
- Unique keys on (`id`, `household_id`) and (`id`, `household_id`, `allocation_method`) are targets for the child rows' composite keys.
- Indexes: `expenses_list_idx` on (`household_id`, `expense_date`, `created_at`, `id`) serves the list, read backward; `expenses_category_idx` on (`household_id`, `category_id`) serves the in-use check; `expenses_currency_idx` on (`household_id`, `currency`) serves per-currency accounting.

`expense_payers`, `expense_allocation_participants`, and `expense_splits` share these columns and keys:

| Column | Definition |
| --- | --- |
| `expense_id` | `uuid`, not null |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `user_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |

- PK (`expense_id`, `user_id`), so a user appears once per table and expense. Reads order child rows by `user_id`, which the key serves; the order the client sent isn't stored. Amounts don't depend on it, because the allocation engine breaks rounding ties by user ID.
- `<table>_expense_fk` references `expenses` (`id`, `household_id`) from (`expense_id`, `household_id`), `ON DELETE CASCADE`, so a child row stays in its expense's household and is deleted with it.
- `<table>_party_fk` references `household_membership_history` from (`household_id`, `user_id`), so a user from another household can't be stored. Whether the user is a current member is checked by the service, not the key.
- `household_id` also cascades from `organization` directly. If child rows were deleted only through their expense, they'd still exist when the household's cascade deletes the membership history, and `<table>_party_fk` would reject the household's deletion.
- No child row stores a currency; amounts are in the expense's `currency`.

Each table adds:

| Table | Columns | Checks |
| --- | --- | --- |
| `expense_payers` | `amount_cents bigint` not null | `> 0` |
| `expense_allocation_participants` | `allocation_method text` not null; `value bigint` nullable: basis points, shares, exact amount in cents, or adjustment in cents, by method | `expense_allocation_participants_value`: `equal` has no value; `percentage` 1 to 10,000; `shares > 0`; `exact >= 0`; `adjustment` set, any sign |
| `expense_splits` | `amount_cents bigint` not null | `>= 0` |

- Participants repeat the expense's `allocation_method` so the check can see it. `expense_allocation_participants_method_fk` references `expenses` (`id`, `household_id`, `allocation_method`) with `ON UPDATE CASCADE`, so changing an expense's method without replacing its participants fails their check. Reads map `value` to the contract field for the method: `basisPoints`, `shares`, `amountCents`, or `adjustmentCents`.
- `expense_payers_member_idx` and `expense_splits_member_idx` on (`household_id`, `user_id`) serve per-member accounting.
- Splits are calculated by the server and never accepted from clients.

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
