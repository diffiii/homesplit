# Expenses API

Module flag: `expenses` · Tasks: #35, #37, #38, #40, #41, #42, #45, #103 · Contracts: [expenses](../../packages/contracts/src/features/expenses/index.ts), [attachments](../../packages/contracts/src/features/attachments/index.ts), [categories](../../packages/contracts/src/features/expenses/categories.ts), [settlements](../../packages/contracts/src/features/expenses/settlements.ts), [write-offs](../../packages/contracts/src/features/expenses/write-offs.ts)

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
| PATCH | `/api/households/:householdId/expenses/:expenseId` | `ExpenseIdParams`, `UpdateExpenseRequest` | `Expense` | 200 | author or admin+ |
| DELETE | `/api/households/:householdId/expenses/:expenseId` | `ExpenseIdParams` | none | 204 | author or admin+ |
| GET | `/api/households/:householdId/expenses/:expenseId/attachments` | `ExpenseIdParams` | `ExpenseAttachmentListResponse` | 200 | all |
| POST | `/api/households/:householdId/expenses/:expenseId/attachments` | `ExpenseIdParams`, `LinkExpenseAttachmentRequest` | `AttachmentSummary` | 201 | author or admin+ |
| DELETE | `/api/households/:householdId/expenses/:expenseId/attachments/:attachmentId` | `ExpenseAttachmentIdParams` | none | 204 | author or admin+ |
| GET | `/api/households/:householdId/settlements` | `HouseholdIdParams`, `ListSettlementHistoryQuery` | `SettlementListResponse` | 200 | all |
| POST | `/api/households/:householdId/settlements` | `HouseholdIdParams`, `ProcessSettlementRequest` | `Settlement` | 201 | party or admin+ |
| POST | `/api/households/:householdId/settlements/:settlementId/confirm` | `SettlementIdParams` | `ConfirmedSettlement` | 200 | payee, or admin+ who isn't the payer |
| DELETE | `/api/households/:householdId/settlements/:settlementId` | `SettlementIdParams` | none | 204 | pending only: party or admin+ |
| POST | `/api/households/:householdId/write-offs` | `HouseholdIdParams`, `WriteOffRequest` | `WriteOffResponse` | 201 | admin+ |
| GET | `/api/households/:householdId/balances` | `HouseholdIdParams` | `BalanceListResponse` | 200 | all |
| GET | `/api/households/:householdId/settlement-suggestions` | `HouseholdIdParams` | `SettlementSuggestionListResponse` | 200 | all |
| GET | `/api/me/balances` | none | `UserBalanceListResponse` | 200 | any signed-in user, for themselves |

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

- Server-set fields: `id`, `householdId`, `author`, `splits`, `attachments`, `createdAt`, and `updatedAt`. The author is the caller. `CreateExpenseRequest` is strict, so sending any of them answers 400 `VALIDATION_ERROR`.
- Splits: the server calculates them with `allocate` from `@homesplit/contracts`, the same engine clients run. They're non-negative, so a participant can owe 0, and add up to the total, as the payers do.
- Payers and participants are independent: a payer needn't take part, and a participant needn't pay. A user appears at most once in each list; a duplicate answers 400 `VALIDATION_ERROR` at its path, such as `["payers", 1, "userId"]`.
- References and eligibility: payers and participants must be [current members](../decisions.md#referenced-users), checked with `assertUsersEligible(tx, householdId, refs, "current")` at the paths `["payers", i, "userId"]` and `["allocation", "participants", i, "userId"]`. A `categoryId` must be one of this household's categories. Either failure answers 400 `INVALID_REFERENCE`.
- Currency: every amount is in `total.currency`.
- Optional fields: an omitted `description` or `categoryId` is stored as `null`.
- Reading back: payers, allocation participants, and splits come back sorted by user ID, not in the order sent. A departed member still shows as author, payer, or participant. Another household's expense answers 404, as a missing one does.
- Ordering: `expenseDate` descending, then `createdAt` descending, then `id` descending. A page past the end has no items and the real `totalItems`.
- Filters: see [Filtering the list](#filtering-the-list).
- Disabled module: both `GET` routes keep working, and `POST`, `PATCH`, and `DELETE` answer 403 `MODULE_DISABLED`.
- Repeated requests: `POST` isn't idempotent, so a repeat creates a second expense. Repeating a `PATCH` gives the same expense again, with a later `updatedAt`. A repeated `DELETE` answers 404.

#### Writing and reading

`create` runs in one transaction: it locks the household with `lockHouseholdForLedgerWrite`, checks the payers, participants, and category, calculates the splits, and writes the expense and its child rows. A failure at any step stores nothing, and a write that waited for a household's deletion answers 404. A category deleted between the check and the write makes `expenses_category_fk` reject the insert, which answers the generic 409 `CONFLICT`.

`packages/backend/src/features/expenses/expenses/expenses.repository.ts` holds the queries. `insertFinancialRows` calculates the splits with `allocate` and writes them with the payers and participants, for both `insertAggregate` and `updateAggregate`. `findExpenses` reads expenses with their author, category, and child rows in one relational query (`db.query.expenses`), using the relations at the end of `packages/backend/src/db/schema/expenses.ts`. A page of the list and its `totalItems` are read in one `readSnapshot`.

#### Attachments

Files are uploaded through the [attachments API](attachments.md) and then linked to an expense. Every expense response, from `GET`, the list, `POST`, and `PATCH`, has `attachments`: one `AttachmentSummary` (`id`, `mimeType`, `sizeBytes`) per linked file, in the order they were linked. Summaries have no download URL, because signed URLs expire; a client gets one from `GET /attachments/:attachmentId/download` when it shows the file.

- References: `attachmentId` must be one of this household's files. A missing file and another household's both answer 400 `INVALID_REFERENCE` with the path `["attachmentId"]`. `expense_attachments_attachment_fk` enforces the same at the database.
- Duplicates: a file is linked to an expense at most once; linking it again answers 409 `ATTACHMENT_ALREADY_LINKED`. The same file may be linked to several expenses of its household.
- Limit: an expense has at most `ATTACHMENT_MAX_PER_EXPENSE` files linked (default 10; see [configuration](attachments.md#configuration)). Linking one more answers 409 `EXPENSE_ATTACHMENT_LIMIT_REACHED` with the limit in `details.limit`; unlinking a file frees its place. The links are counted under the expense's row lock, so concurrent links can't pass the limit together. Lowering the limit keeps the links an expense already has and only rejects new ones. A duplicate answers `ATTACHMENT_ALREADY_LINKED` even at the limit.
- Rights: linking and unlinking change the expense, so only its author or an admin+ may, as for `PATCH`. Another household's or a missing expense answers 404 before any 403. Neither changes the expense's `updatedAt`.
- Unlinking: `DELETE` removes the link and keeps the file, which [cleanup](attachments.md#cleanup) deletes once nothing references it. A file that isn't linked to the expense answers 404, so a repeated `DELETE` does too.
- Disabled module: `GET /attachments` and the expense reads keep working, and so do downloads. `POST` and `DELETE` answer 403 `MODULE_DISABLED`.
- Concurrency: linking and unlinking lock the expense row `FOR UPDATE`, like edits, so they wait for an edit or a deletion of the same expense; one that waited for a deletion answers 404. Linking also locks the file's row `FOR KEY SHARE`, which cleanup skips, so cleanup can't delete a file while it's being linked. If cleanup got there first, the link answers 400 `INVALID_REFERENCE`.

`packages/backend/src/features/expenses/expense-attachments/` holds the routes. `findExpenses` reads the links with the rest of the expense through the `attachments` relation, using `linkedAttachments` from `expenses.repository.ts`, which the list route shares.

#### Filtering the list

`GET /expenses` takes optional filters in `ListExpensesQuery`, next to `page` and `pageSize`. Each given filter must match, so they combine with AND, and an omitted one matches everything.

| Parameter | Matches |
| --- | --- |
| `categoryId` | Expenses in that category. The value `none` (`UNCATEGORIZED` in the contracts) matches expenses without one. |
| `userId` | Expenses where the user is a payer or an allocation participant. Being only the author doesn't count. |
| `from` | `expenseDate` on or after this `IsoDate`. |
| `to` | `expenseDate` on or before this `IsoDate`. |

- The order and pagination stay as without filters, and `totalItems` counts only the matching expenses.
- `categoryId` is one value: an ID or `none`, never both. A separate `uncategorized` flag would allow contradictory combinations.
- `userId` accepts any user and isn't checked against the household. A [departed member](../decisions.md#departed-members) still matches the expenses they're on, and a user who has never been a member matches nothing.
- IDs from another household, and unknown ones, match nothing: the answer is 200 with empty `items` and `totalItems` 0, not an error.
- `from` after `to` answers 400 `VALIDATION_ERROR` with the path `["from"]`. `from` equal to `to` matches that one day. A malformed ID or date, or a `categoryId` other than an ID or `none`, also answers 400 `VALIDATION_ERROR`.

`expensesMatching` in `expenses.repository.ts` builds the condition, used for both the page and `totalItems`. The user filter is two correlated `EXISTS` subqueries, on `expense_payers` and `expense_allocation_participants`, each served by the table's (`expense_id`, `user_id`) primary key.

Indexes keep the list order under every filter:

- No filter, or only `from` and `to`: `expenses_list_idx`, read backward, with the dates as a range after `household_id`.
- `categoryId`, with or without dates: `expenses_category_idx` on (`household_id`, `category_id`, `expense_date`, `created_at`, `id`), read backward the same way. `category_id IS NULL` uses it too.
- `userId`: the list goes through either index in order and checks each expense with the two primary-key lookups, stopping once the page is full; `totalItems` checks every expense the other filters leave.

With 2,000 households of 5 members and 100 expenses each, a filtered page and its count each ran in under 2 ms, using only index scans.

#### Editing

`PATCH` follows the shared [partial-update rules](../decisions.md#responses):

- Descriptive fields (`name`, `description`, `categoryId`, `expenseDate`) are patched one by one. An omitted field stays, and `null` clears `description` or `categoryId`. A descriptive-only patch never touches the total, payers, allocation, or splits, and doesn't re-check payers or participants, so it works on an expense whose payers or participants have left.
- `financial` replaces the total, payers, allocation, and splits as a whole. It's validated like a create (sums, duplicates, method values), the server recalculates the splits with `allocate`, and the currency may change. There's no partial financial patch: a client that changes one payer sends the whole spec.
- Server-set fields stay server-set. `UpdateExpenseRequest` is strict, so `author`, `splits`, `createdAt`, and the like answer 400 `VALIDATION_ERROR`. `updatedAt` changes on every successful `PATCH`; `author` and `createdAt` never do.
- An empty body answers 400 `EMPTY_PATCH`.
- References and eligibility, by the [historical-edit rules](../decisions.md#historical-expense-edits): in a financial replacement, a user who is already a payer or allocation participant of the stored expense may stay, in either role, even after leaving. Anyone else must be a current member, checked with `assertUsersEligible(tx, householdId, refs, "current")` at `["financial", "payers", i, "userId"]` and `["financial", "allocation", "participants", i, "userId"]`. Users already on the expense aren't looked up, because the child rows' `<table>_party_fk` keys already make them household parties. A removed departed user is no longer on the expense, so a later replacement can't add them back. A non-null `categoryId` must be one of this household's categories.
- Rights: the service checks that the caller is the author or an admin+ after finding the expense, so another household's or a missing expense answers 404 before any 403.

`update` runs in one transaction: it locks the household with `lockHouseholdForLedgerWrite`, locks the expense row, checks the caller's right and the references, then deletes the old payers, participants, and splits, updates the expense row, and inserts the new child rows with `insertFinancialRows`. The old child rows go first, because changing `allocation_method` cascades to the participants through `expense_allocation_participants_method_fk`, and the old values may not fit the new method. Any failure rolls the whole replacement back, so the expense keeps its old financial state.

#### Deleting

`DELETE` removes the expense; its payers, participants, splits, and attachment links cascade through `<table>_expense_fk` in the same statement and transaction, so a failure leaves all of them in place. Payments reference no expense, so deleting one never changes recorded payments; #41 recalculates balances from what remains. There's no soft delete or undo.

Linked files aren't deleted with the expense: they're kept unlinked, and [cleanup](attachments.md#cleanup) deletes each one, with its object, once no other expense or receipt references it. A file is usually older than `ATTACHMENT_UNREFERENCED_TTL_HOURS` by then, so the next cleanup run deletes it. Deleting files inside the expense's transaction would need the object storage in that transaction, and a file linked to another expense must stay anyway, so the expense routes leave storage to cleanup.

#### Concurrent edits

Writes to one expense are serialized, and the last one wins. There's no version field or ETag precondition, so the contracts don't change.

- `update` and `delete` lock the expense row `SELECT … FOR UPDATE`, after the household's `FOR SHARE` lock, and every check runs after both locks. A write that waited for another one sees what that one committed.
- Overlapping financial replacements apply one after the other, each as a whole. The stored expense always matches exactly one request's spec, never a mix, and its splits always come from its own total and allocation.
- The second replacement's eligibility check uses the payers and participants the first one stored. If the first one removed a departed user and the second keeps them, the second answers 400 `INVALID_REFERENCE`.
- A descriptive patch that waited for a financial replacement keeps the replacement's financial state, and the reverse, since each writes only its own fields. Two patches to the same descriptive field keep the later one.
- An edit or delete that waited for a deletion answers 404. A delete that waited for an edit deletes the edited expense.
- `updatedAt` is the database's `statement_timestamp()` of the update, which runs after the lock, so serialized edits get increasing times.

A client editing from a stale copy overwrites changes made since it read the expense. That's accepted: an expense is usually edited by its author, every response returns the full stored expense, and the edit is visible to everyone. If lost edits become a problem, propose optimistic concurrency as a contract change first, such as `If-Match` with the expense's `updatedAt` and a 412 or 409 on mismatch.

### Settlements

A payment is an independent ledger entry. It references no expense or split, so editing or deleting an expense never touches it.

- Server-set fields: `id`, `householdId`, `createdBy`, `createdAt`, `status`, `confirmedBy`, and `confirmedAt`. `ProcessSettlementRequest` is strict, so sending any of them answers 400 `VALIDATION_ERROR`.
- References and eligibility: `payerId` and `payeeId` are distinct [household parties](../decisions.md#membership-history), checked with `assertUsersEligible(tx, householdId, refs, "party")`. That's one lookup in `household_membership_history` and never reads balances, so a departed member's debt can be settled before #41 exists. The recorder's right is checked first: a member recording a payment between two other users gets 403 `FORBIDDEN`, whoever those users are.
- Status: a payment recorded by its payer is `pending`. Any other is `confirmed` at once, with the recorder as `confirmedBy` and `confirmedAt` equal to `createdAt`. Only confirmed payments count toward balances.
- Amounts: `amount.amountCents` is a positive integer up to `MAX_AMOUNT_CENTS` in any [supported currency](../money.md#supported-currencies). The currency doesn't have to match an existing expense.
- Notes: an omitted `note` is stored as `null`.
- Ordering: `createdAt` descending, then `id` descending. `createdAt` is the database's time when the recording transaction started.
- Filtering: `GET /settlements?status=pending` or `status=confirmed` keeps only payments in that state, and `totalItems` counts only those, so a screen can list what's pending without paging through the history.
- Disabled module: `GET /settlements` keeps working. The other routes, and `POST /write-offs`, answer 403 `MODULE_DISABLED`.

#### Overpayment

Payments aren't checked against balances. A payment may be larger than what the payer owes, and may be recorded between parties who owe each other nothing. It moves both balances by its amount, so an overpayment shows up as a debt in the other direction.

- A balance changes whenever an expense is added, edited, or deleted. A limit would reject a real payment because of an expense somebody hasn't entered yet, or accept one that a later edit turns into an overpayment anyway.
- [Writing off a debt by splitting it](../decisions.md#writing-off-debts) records payments from the debtor to members the debtor doesn't owe.

So #41 has no balance-based restriction to implement; a balances test checks that an overpayment is accepted and turns into a debt the other way.

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

Every transaction that writes a payment first locks the household's `organization` row `FOR SHARE` with `lockHouseholdForLedgerWrite` (a write-off takes `FOR UPDATE`, see [Write-offs](#write-offs)) from `packages/backend/src/features/expenses/household-ledger-lock.ts`, as [the decision record](../decisions.md#deleting-households) requires of every ledger write. A write that waited for a household's deletion answers 404.

Confirming and deleting also lock the payment's row `FOR UPDATE`. When both arrive together, the second one sees the first one's result: a confirmation after a deletion answers 404, and a deletion after a confirmation answers 409.

A page of the history and its `totalItems` are read in one read-only `REPEATABLE READ` transaction (`readSnapshot` in `packages/backend/src/db/index.ts`).

#### Write-offs

`POST /write-offs` [writes off](../decisions.md#writing-off-debts) a departed member's balance in one currency. In one transaction, it locks the household's `organization` row `FOR UPDATE` with `lockHouseholdLedger`, so no ledger write runs in between, reads the balances and current members, and records every payment `planWriteOff` from `@homesplit/contracts` returns. Clients run the same function to show the payments first.

- Every payment is `confirmed` at once by the caller, with the note `Write-off`, even when the caller is its payer.
- `userId` must have been a member (400 `INVALID_REFERENCE` otherwise) and mustn't be one now (409 `MEMBER_NOT_DEPARTED`).
- `amountCents` is the balance the caller saw. If it isn't the balance now, nothing is recorded and the answer is 409 `BALANCE_CHANGED`. A repeated request finds the balance at zero, so it's safe to resend one whose answer never came.
- While a payment with the member in that currency is pending, the answer is 409 `HAS_PENDING_PAYMENTS`, since confirming it later would undo part of the write-off.
- Payments aren't limited to `MAX_AMOUNT_CENTS`, since the server builds them from a balance.

### Balances

Balances are computed on every request from the stored payers, splits, and confirmed payments. There's no cache table.

- Formula: for each user and currency, balance = paid on expenses − allocated shares (splits) + payments sent − payments received. Positive means the user is owed money. Pending payments don't count. Currencies are never converted or netted.
- Zero sum: within a currency, payers and splits of each expense both add up to its total, and each payment adds its amount to one party and subtracts it from the other, so every currency's balances add up to zero.
- Expense edits and deletions: balances follow whatever is stored at the time of the request. A deleted expense stops counting, and payments, which reference no expense, keep counting on their own.
- Settled-up checks: deleting a household, turning off `expenses`, and leaving require zero balances; see [Settled-up checks](households.md#settled-up-checks).

#### `GET /balances`

- Currencies: a currency is listed only while some balance in it isn't zero. A household without expenses or payments, or one that's settled up, answers `{ items: [] }`.
- Members: each listed currency has every current member, at zero if their balance in it is zero, and every [departed member](../decisions.md#departed-members) whose balance in it isn't zero.
- Ordering: currencies by code ascending; within a currency, `amountCents` descending (creditors first), then user ID ascending.
- Disabled module: the route keeps working.

#### `GET /settlement-suggestions`

Transfers that, once recorded as confirmed payments, bring every balance in their currency to zero. They're computed from the `GET /balances` sums on every request, never stored, and never recorded automatically; a client records each one with `POST /settlements`.

- Currencies: one entry for each currency `GET /balances` lists, so a settled household answers `{ items: [] }`. Currencies are never netted, and each suggestion's currency is its entry's.
- Suggestions: each one is a positive amount from a debtor to a different creditor. Every user with a non-zero balance has a ledger row in the household, so they're a [household party](../decisions.md#membership-history) and `POST /settlements` accepts them, departed members included. Current members at zero never appear.
- Algorithm: `suggestSettlements` in `packages/backend/src/features/expenses/balances/settlement-suggestions.ts` sorts creditors and debtors each by amount descending, then user ID ascending, and walks both lists in step: the current debtor pays the current creditor the smaller of what they owe and are owed, and whoever reaches zero gives way to the next in their list. Since a currency's balances add up to zero, both lists run out together.
- Complexity: O(n log n) for n non-zero balances in a currency, dominated by the sort, with at most n − 1 suggestions. That's not a promise of the fewest transfers: finding those is NP-hard, and the greedy walk can miss pairs that would cancel exactly.
- Ordering: currencies by code ascending; within a currency, the order the walk produces them, which starts with the largest debtor paying the largest creditor. The output depends only on the balances, so repeated requests on an unchanged ledger, and equal balances read in another order, give the same suggestions.
- Disabled module: the route keeps working.

#### `GET /api/me/balances`

The session user's own balances in every household where they're a current member, in one request and one query. Clients use it for a cross-household summary instead of calling `GET /balances` once per household.

- Households: only those the user is a current member of. A household they've left doesn't appear, since departed members have no access, even if they still owe or are owed money there. The module flag doesn't matter.
- Currencies: each entry's `households` lists the households where the user's balance in that currency isn't zero, and `amountCents` is their sum, which may be zero when the user is owed in one household and owes in another. A currency with no such household isn't listed, so a user who is settled everywhere gets `{ items: [] }`.
- Ordering: currencies by code ascending; within a currency, `amountCents` descending, then household ID ascending.

#### Querying

`packages/backend/src/features/expenses/balances/balances.repository.ts` builds both queries from one ledger: a `UNION ALL` of four branches, payers (+), splits (−), confirmed payments by their payer (+), and by their payee (−), summed by currency and user, or by currency and household. Each child table is its own branch, joined only to its expense for the currency, so a payer row never multiplies a split row. `GET /balances` filters every branch by household, and `GET /api/me/balances` by the user's own rows in the households listed in `member` for them. The filter goes into each branch rather than around the union: around it, `user_id` alone can't seek the (`household_id`, `user_id`) indexes. Users and households are joined after summing, so each is looked up once.

- `GET /balances` reads the sums and the current members in one read-only `REPEATABLE READ` transaction (`readSnapshot`), so both see the same snapshot. `GET /api/me/balances` is a single statement.
- Sums arrive as strings and go through `toSafeInteger`. A user's total across households is summed as `bigint` first.
- Indexes: the household scope uses `expense_payers_member_idx` and `expense_splits_member_idx` on their `household_id` prefix, any `expenses` index on `household_id`, and `settlements_history_idx`. The user scope looks up `member` by `user_id` and then seeks (`household_id`, `user_id`) in the child tables and (`household_id`, `payer_id`) or (`household_id`, `payee_id`) in `settlements`. With 2,000 households of 5 members, 100 expenses and 520 payments each, and 505,000 users, `GET /balances` ran in about 3.5 ms and `GET /api/me/balances` in about 1.3 ms, using only index scans. The cost grows with the ledger rows read: a household's whole ledger, or the user's own rows in their households.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `EMPTY_PATCH` | `PATCH /expense-categories/:categoryId` or `PATCH /expenses/:expenseId` body has no fields after parsing. |
| 400 | `INVALID_REFERENCE` | A `categoryId` in a request body isn't a category of this household. |
| 400 | `INVALID_REFERENCE` | An expense payer or participant isn't a current member of this household and, in a financial replacement, isn't already on the expense. `details.issues` has one entry per failing user. |
| 400 | `INVALID_REFERENCE` | `payerId` or `payeeId` has never been a member of this household. `details.issues` has one entry per failing field. |
| 400 | `INVALID_REFERENCE` | An `attachmentId` to link isn't a file of this household. |
| 400 | `INVALID_REFERENCE` | A write-off's `userId` has never been a member of this household. |
| 403 | `FORBIDDEN` | Editing or deleting an expense, or linking or unlinking its files, as a `member` who isn't its author. |
| 403 | `FORBIDDEN` | Recording a payment between two other users, or deleting one, without being admin+. Confirming a payment as its payer, or as a member who isn't its payee. Writing off a balance as a `member`. |
| 409 | `ATTACHMENT_ALREADY_LINKED` | Linking a file that's already linked to the expense. |
| 409 | `CATEGORY_IN_USE` | Deleting a category that an expense uses. |
| 409 | `EXPENSE_ATTACHMENT_LIMIT_REACHED` | Linking a file to an expense that already has `ATTACHMENT_MAX_PER_EXPENSE` files. `details.limit` holds the limit. |
| 409 | `SETTLEMENT_CONFIRMED` | Deleting a confirmed payment. |
| 409 | `MEMBER_NOT_DEPARTED` | Writing off the balance of a current member. |
| 409 | `BALANCE_CHANGED` | Writing off a balance that isn't `amountCents` any more. |
| 409 | `HAS_PENDING_PAYMENTS` | Writing off a balance while a payment with that member in that currency is pending. |

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
- Indexes: `expenses_list_idx` on (`household_id`, `expense_date`, `created_at`, `id`) serves the list, read backward; `expenses_category_idx` on (`household_id`, `category_id`, `expense_date`, `created_at`, `id`) serves the category filter in the list order and, by its prefix, the in-use check; `expenses_currency_idx` on (`household_id`, `currency`) serves per-currency accounting.

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

`expense_attachments`:

| Column | Definition |
| --- | --- |
| `expense_id` | `uuid`, not null |
| `attachment_id` | `uuid`, not null |
| `household_id` | `uuid`, not null |
| `created_at` | `timestamptz`, not null, default `now()`; when the file was linked |

- PK (`expense_id`, `attachment_id`), so a file is linked to an expense once. Reads order links by `created_at`, then `attachment_id`.
- `expense_attachments_expense_fk` references `expenses` (`id`, `household_id`) and `expense_attachments_attachment_fk` references `attachments` (`id`, `household_id`), both from the row's own `household_id` and `ON DELETE CASCADE`. Sharing the column keeps the file in the expense's household.
- Deleting the expense deletes its links. The attachment key's cascade runs only when the household goes, since cleanup deletes only files without links.
- `expense_attachments_attachment_idx` on `attachment_id` serves cleanup's check for links to a file and the cascade from `attachments`.

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
- `settlements_history_idx` on (`household_id`, `created_at`, `id`) serves the history, read backward, and the household's payments in balances.
- `settlements_payer_idx` on (`household_id`, `payer_id`) and `settlements_payee_idx` on (`household_id`, `payee_id`) serve one party's payments, as in `GET /api/me/balances`, and the referencing side of the two party keys.
- Deleting a household deletes its payments.
