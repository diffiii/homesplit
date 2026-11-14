# Receipts API

Module flag: `expenses`, plus `ai` for reading receipts · Tasks: #55, #56 · Contracts: [receipts](../../packages/contracts/src/features/receipts/index.ts), [split](../../packages/contracts/src/features/receipts/split.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/receipts` | `HouseholdIdParams`, `ListReceiptsQuery` | `ReceiptListResponse` | 200 | all |
| POST | `/api/households/:householdId/receipts` | `HouseholdIdParams`, `CreateReceiptRequest` | `Receipt` | 201 | all |
| GET | `/api/households/:householdId/receipts/:receiptId` | `ReceiptIdParams` | `Receipt` | 200 | all |
| PATCH | `/api/households/:householdId/receipts/:receiptId` | `ReceiptIdParams`, `UpdateReceiptRequest` | `Receipt` | 200 | all |
| DELETE | `/api/households/:householdId/receipts/:receiptId` | `ReceiptIdParams` | none | 204 | all |
| POST | `/api/households/:householdId/receipts/:receiptId/retry` | `ReceiptIdParams` | `Receipt` | 200 | all |
| PUT | `/api/households/:householdId/receipts/:receiptId/assignments` | `ReceiptIdParams`, `AssignReceiptItemsRequest` | `Receipt` | 200 | all |
| GET | `/api/households/:householdId/receipts/:receiptId/split` | `ReceiptIdParams` | `ReceiptSplit` | 200 | all |
| POST | `/api/households/:householdId/receipts/:receiptId/confirm` | `ReceiptIdParams`, `ConfirmReceiptRequest` | `ConfirmReceiptResponse` | 200 | all |

## Rules

A member uploads a photo or a PDF of a receipt as an [attachment](expenses.md#attachments), then scans it with `POST /receipts`. The vision model reads the file directly, without a separate OCR step (see [AI provider](../decisions.md#ai-provider)), and the result is a draft that members check and edit. Members then assign each item to one or more people, and confirming turns the receipt into an expense with `exact` splits.

### Statuses

| Status | Means | Edit | Discard | Retry |
| --- | --- | --- | --- | --- |
| `processing` | The model is reading the file | 409 `RECEIPT_PROCESSING` | yes | 409 `RECEIPT_NOT_FAILED` |
| `ready` | The draft can be edited | yes | yes | 409 `RECEIPT_NOT_FAILED` |
| `failed` | Extraction failed; `failureCode` says why | yes, and the receipt becomes `ready` | yes | yes |
| `confirmed` | An expense was made from it; read-only | 409 `RECEIPT_CONFIRMED` | 409 `RECEIPT_CONFIRMED` | 409 `RECEIPT_NOT_FAILED` |

- `failureCode` is set only while the receipt is `failed`. It's one of `ReceiptFailureCode`: the AI errors (`MODULE_DISABLED`, `AI_UNAVAILABLE`, `AI_LIMIT_EXCEEDED`, `AI_TIMEOUT`, `AI_PROVIDER_ERROR`, `AI_INVALID_OUTPUT`), `UNSUPPORTED_FILE_TYPE` for an image that can't be decoded, `NOT_A_RECEIPT` when the model finds no receipt in the file, `EXTRACTION_INTERRUPTED`, and `EXTRACTION_FAILED` for anything else.
- A failed receipt is retried with `POST /retry`, or filled in by hand with `PATCH`.
- `POST /confirm` sets `confirmed`; see [Confirming](#confirming). Assigning items, like editing, answers 409 `RECEIPT_PROCESSING` or `RECEIPT_CONFIRMED`.

### Reading a receipt

- `POST /receipts` checks the attachment (400 `INVALID_REFERENCE` when it isn't the household's), then that AI is available, as `AiService` would (403 `MODULE_DISABLED` for `ai`, 503 `AI_UNAVAILABLE`). It answers 201 at once with the receipt `processing`, and extraction runs in the background in the API process. Clients poll `GET /receipts/:receiptId` until the status changes, every second or two.
- The daily AI limit is used when the background run calls the model, so going over it ends as a `failed` receipt with `AI_LIMIT_EXCEEDED`, not as a 429. A retry calls the model again and counts again.
- Only the file goes to the model, as `attachmentInput` prepares it; nothing about the member or the household does.
- Extraction and a member's edit write a draft the same way. The model's draft is parsed with `ReceiptDraftFields`, the schema `UpdateReceiptRequest` is the partial form of, and goes through the same write as `PATCH`, which only differs in which row it may update.
- The model replies with decimal amounts, which the server converts to minor units with the currency's ISO 4217 exponent, rounding half away from zero; while the currency is unknown, it uses 2 (see [Money](../money.md#minor-units)). A merchant, date, or currency it can't read becomes `null`. Anything else outside the limits an edit must meet, such as an amount past `MAX_AMOUNT_CENTS` or more than `MAX_RECEIPT_ITEMS` items, fails the run with `AI_INVALID_OUTPUT`.
- Discount lines such as "Rabat" are folded into the `discountCents` of the item they reduce, and that item's `totalCents` is the amount after the discount. Discounts on the whole receipt go in the receipt's own `discountCents`.
- Each run carries its own `extraction_id`, and only a receipt still `processing` with that ID takes its result. A run that a discard or a retry overtook writes nothing.
- A receipt still `processing` longer than a run can take, such as one the server stopped working on during a restart, reads as `failed` with `EXTRACTION_INTERRUPTED` and can be retried or edited. That limit, `STALE_AFTER_MS`, is the AI layer's `longestRequestMs()` (`AI_TIMEOUT_MS`, which bounds a call with all its retries) plus 5 minutes for reading the file and writing the draft, so a run still going never shows as interrupted.
- Failure codes are `AI_ERROR_CODES`, the codes the AI layer throws, plus the receipt's own. The AI layer builds every error through `aiError`, typed with that list, so a new AI code can't silently become `EXTRACTION_FAILED`.

### The draft

- `itemsTotalCents` is the sum of the items' `totalCents`. `differenceCents` is `itemsTotalCents - discountCents - totalCents`: zero when the items add up to the receipt's total, and `null` while the total is unknown. Clients show it so members can fix the draft; it doesn't block anything.
- Quantities have up to three decimals, so weighed products fit. Unit prices and line totals may be negative, for a returned deposit for example; discounts and the receipt's total can't be.
- The header and item values are drafts: the server doesn't check that `quantity × unitPriceCents − discountCents` equals the line total, because receipts round it in their own way.

### Editing

- Any member may edit or discard any receipt of the household.
- `items` replaces the whole list, in the order given: an item with an `id` keeps it, items left out are deleted, and items without an `id` are added. Positions are renumbered from 0 in that order, which is how items are reordered. An `id` that appears twice answers 400 `VALIDATION_ERROR`, and one that isn't an item of this receipt answers 400 `INVALID_REFERENCE` at `["items", index, "id"]`.
- Server-set fields: `status`, `failureCode`, `attachmentId`, `createdBy`, `createdAt`, `updatedAt`, the item `position`s, and the totals.
- Ordering: the list is `createdAt` desc, then `id` desc, and has no items; `GET /receipts/:receiptId` has them in `position` order.
- Concurrent requests: every write locks the receipt row, so an edit, a discard, a retry, and the end of a run never interleave.

### Assigning items

Every assignment is a number of shares of one item, a positive integer up to `MAX_SHARES`. One person with 1 share has the whole item; several people with 1 share each split it equally. For an item with a quantity above 1, the client can send each person's number of units as their shares (2 of 3 beers for A and 1 for B); a weighed item only uses shares.

- `PUT /assignments` takes `{ items: [{ itemId, assignees: [{ userId, shares }] }] }`. Each listed item's assignments are replaced as a whole, and an empty `assignees` makes it unassigned; items left out keep theirs. So assigning several selected items at once, or "split everything equally", is one request that lists those items.
- References: every `itemId` must be one of this receipt's items (400 `INVALID_REFERENCE` at `["items", i, "itemId"]`), and every assignee a current member of the household (400 `INVALID_REFERENCE` at `["items", i, "assignees", j, "userId"]`). An item or a user listed twice answers 400 `VALIDATION_ERROR`.
- `Receipt` items have `assignments` (`{ user, shares }`, ordered by user ID). Editing items with `PATCH` keeps the assignments of the items it keeps, drops those of the items it removes, and adds new items unassigned. A retry replaces the items, and with them the assignments.

### Splitting

`splitReceipt` in the contracts calculates the split, so clients show the same live totals as `GET /split` answers:

1. Each item's cost after its line discount (`totalCents`) goes to its assignees in proportion to their shares.
2. The receipt-level discount is spread over the items in proportion to their cost, so what's split is the items' total minus `discountCents`.
3. Each person's amount is summed as an exact fraction over a common denominator and rounded once at the end with `distributeProportionally`, the allocation engine's remainder rule (see [Money](../money.md#rounding)): leftover units go to the largest remainders, and ties to the lower user ID. So the amounts and the unassigned part add up exactly to what's split.

`GET /split` answers `ReceiptSplit`: `totalCents` (what's split), `people` (one `{ user, amountCents }` per assignee, ordered by user ID), `unassignedCents` and `unassignedItemIds` for items nobody has, and the receipt's own `differenceCents`. Nothing is saved.

For example, beer 3 × 4.99 = 14.97 (A 2 units, B 1 unit) and pizza 30.00 (A, B, and C equally) give A 19.98, B 14.99, and C 10.00, for a total of 44.97.

A line with a negative total, such as a returned deposit, is fine as long as its assignees' other items cover it. When someone would get a negative amount, `GET /split` and `POST /confirm` answer 409 `RECEIPT_NEGATIVE_SHARE`.

### Confirming

`POST /confirm` creates the expense, links the receipt's file to it as an attachment, and marks the receipt `confirmed`, in one transaction, so a failure at any step leaves nothing behind. Any member may confirm, as any member may record an expense.

- The body is optional field by field. `payerId` defaults to who scanned the receipt, `name` and `expenseDate` to its merchant and purchase date, and `description` to none. `categoryId` defaults to the [category suggestion](expenses.md#category-suggestions) for the name and the item names, used only when its confidence is `"high"`, as clients do; without AI, or when the suggestion fails, the expense has no category. `categoryId: null` asks for no category and skips the suggestion.
- The expense has the receipt's total and currency, one payer who paid it all, and the `exact` allocation method with each person's amount from the split. The caller is its author. It goes through the same checks as `POST /expenses`: the payer must be a current member (400 `INVALID_REFERENCE` at `["payerId"]`), the category one of the household's, and a name or date the request and the receipt both lack answers 400 `VALIDATION_ERROR` at `["name"]` or `["expenseDate"]`.
- Confirming answers 409 while the receipt can't become an expense: `RECEIPT_PROCESSING`, `RECEIPT_CONFIRMED` (including a second confirm), `RECEIPT_NOT_READY` for a `failed` receipt, `RECEIPT_INCOMPLETE` without a currency or a total (`details.fields`), `RECEIPT_ITEMS_UNASSIGNED` while any item is unassigned (`details.itemIds`), `RECEIPT_TOTAL_MISMATCH` while `differenceCents` isn't zero (`details.differenceCents`), and `RECEIPT_ASSIGNEE_NOT_MEMBER` when someone assigned has left the household since (`details.userIds`).
- Order: the receipt's status is checked first, before the suggestion, so a receipt that can't be confirmed never uses the AI quota. Then, under the receipt's lock, the payer and the category, the status again, the header, the split, the assignees, and the expense request itself.
- The answer is `{ receipt, expense }`. The receipt keeps its items and assignments as the record of who had what, `receipt.expenseId` is the expense, and `expense.receiptId` links back to the receipt. The expense's splits stay the only source for balances.

### After confirming

- Editing the expense's name, description, date, or category keeps the link.
- Editing its amounts (`financial` in `PATCH /expenses/:expenseId`) unlinks the receipt: `expense.receiptId` and `receipt.expenseId` become `null`, and the receipt stays `confirmed` and read-only, as the record of the scan. It can't be confirmed again, so the edited expense and a second one never count the same costs twice. The receipt's file stays linked to the expense until someone unlinks it.
- Deleting the expense puts the receipt back to `ready` with its items and assignments, so it can be corrected and confirmed again.

### Discarding

`DELETE` removes the receipt and its items in any status but `confirmed`, even while it's `processing`. The scanned file stays as an attachment, and [cleanup](expenses.md#attachments) deletes it once nothing references it.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply, as do the AI errors from [AI provider](../decisions.md#ai-provider) on `POST /receipts` and `POST /retry`. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 409 | `RECEIPT_PROCESSING` | Editing, assigning, or confirming a receipt the model is still reading |
| 409 | `RECEIPT_CONFIRMED` | Editing, assigning, discarding, or confirming a confirmed receipt |
| 409 | `RECEIPT_NOT_READY` | Confirming a `failed` receipt |
| 409 | `RECEIPT_INCOMPLETE` | Confirming a receipt without a currency or a total; `details.fields` lists them |
| 409 | `RECEIPT_ITEMS_UNASSIGNED` | Confirming while an item has no assignee; `details.itemIds` lists them |
| 409 | `RECEIPT_TOTAL_MISMATCH` | Confirming while the items don't add up to the total; `details.differenceCents` |
| 409 | `RECEIPT_ASSIGNEE_NOT_MEMBER` | Confirming with an assignee who has left; `details.userIds` |
| 409 | `RECEIPT_NEGATIVE_SHARE` | Splitting or confirming when someone would get a negative amount |
| 409 | `RECEIPT_NOT_FAILED` | Retrying a receipt that isn't `failed` |

## Storage

- `receipts`: `household_id` cascades from the household. `(attachment_id, household_id)` references `attachments (id, household_id)`, so the file is in the receipt's household; it cascades, which happens only when the household goes, because cleanup deletes only files nothing references. `(household_id, created_by_id)` references `household_membership_history`. Checks keep `status` to the four values, `failure_code` set exactly while `failed`, `extraction_id` set exactly while `processing`, a non-blank `merchant`, a three-letter `currency`, and non-negative `total_cents` and `discount_cents`. `receipts_list_idx (household_id, created_at, id)` serves the list, and `receipts_attachment_idx (attachment_id)` serves cleanup's check and the cascade.
- `receipt_items`: `receipt_id` cascades from the receipt. `quantity` is `numeric(12, 3)` and amounts are `bigint`. Checks keep a non-blank `name`, a non-negative `position` and `discount_cents`, and a positive `quantity`. `receipt_items_receipt_idx (receipt_id, position)` serves reads; positions aren't unique, so an edit can renumber them freely.
- `receipts.expense_id` references `expenses.id` with `ON DELETE SET NULL`, which only a household's deletion reaches, because deleting an expense puts its receipt back to `ready` first. `receipts_expense_id_key` keeps it to one receipt per expense and serves the lookup from the expense, and `receipts_expense` allows it only on a `confirmed` receipt. The confirm route creates the expense in the receipt's own household, so the key needs no `household_id`.
- `receipt_item_assignments`: the primary key is `(receipt_item_id, user_id)`, and rows cascade from their item. `(household_id, user_id)` references `household_membership_history`, served by `receipt_item_assignments_party_idx`, and `shares` is a positive `integer`.

## Code

`packages/backend/src/features/receipts/` holds the routes: `receipts.service.ts` has the state rules, `receipts.repository.ts` the queries and the one draft write, `receipt-extraction.ts` the background run, `receipt-draft.ts` the prompt and the parsing of the model's reply, which need no database, and `receipt-confirmation.service.ts` assigning items, the split preview, and confirming. The split itself is `splitReceipt` in the contracts.
