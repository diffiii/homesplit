# Receipts API

Module flag: `expenses`, plus `ai` for reading receipts · Tasks: #55 · Contracts: [receipts](../../packages/contracts/src/features/receipts/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/receipts` | `HouseholdIdParams`, `ListReceiptsQuery` | `ReceiptListResponse` | 200 | all |
| POST | `/api/households/:householdId/receipts` | `HouseholdIdParams`, `CreateReceiptRequest` | `Receipt` | 201 | all |
| GET | `/api/households/:householdId/receipts/:receiptId` | `ReceiptIdParams` | `Receipt` | 200 | all |
| PATCH | `/api/households/:householdId/receipts/:receiptId` | `ReceiptIdParams`, `UpdateReceiptRequest` | `Receipt` | 200 | all |
| DELETE | `/api/households/:householdId/receipts/:receiptId` | `ReceiptIdParams` | none | 204 | all |
| POST | `/api/households/:householdId/receipts/:receiptId/retry` | `ReceiptIdParams` | `Receipt` | 200 | all |

## Rules

A member uploads a photo or a PDF of a receipt as an [attachment](expenses.md#attachments), then scans it with `POST /receipts`. The vision model reads the file directly, without a separate OCR step (see [AI provider](../decisions.md#ai-provider)), and the result is a draft that members check and edit before a later task turns it into an expense.

### Statuses

| Status | Means | Edit | Discard | Retry |
| --- | --- | --- | --- | --- |
| `processing` | The model is reading the file | 409 `RECEIPT_PROCESSING` | yes | 409 `RECEIPT_NOT_FAILED` |
| `ready` | The draft can be edited | yes | yes | 409 `RECEIPT_NOT_FAILED` |
| `failed` | Extraction failed; `failureCode` says why | yes, and the receipt becomes `ready` | yes | yes |
| `confirmed` | An expense was made from it; read-only | 409 `RECEIPT_CONFIRMED` | 409 `RECEIPT_CONFIRMED` | 409 `RECEIPT_NOT_FAILED` |

- `failureCode` is set only while the receipt is `failed`. It's one of `ReceiptFailureCode`: the AI errors (`MODULE_DISABLED`, `AI_UNAVAILABLE`, `AI_LIMIT_EXCEEDED`, `AI_TIMEOUT`, `AI_PROVIDER_ERROR`, `AI_INVALID_OUTPUT`), `UNSUPPORTED_FILE_TYPE` for an image that can't be decoded, `NOT_A_RECEIPT` when the model finds no receipt in the file, `EXTRACTION_INTERRUPTED`, and `EXTRACTION_FAILED` for anything else.
- A failed receipt is retried with `POST /retry`, or filled in by hand with `PATCH`.
- Nothing sets `confirmed` yet; the task that turns a receipt into an expense does.

### Reading a receipt

- `POST /receipts` checks the attachment (400 `INVALID_REFERENCE` when it isn't the household's), then that AI is available, as `AiService` would (403 `MODULE_DISABLED` for `ai`, 503 `AI_UNAVAILABLE`). It answers 201 at once with the receipt `processing`, and extraction runs in the background in the API process. Clients poll `GET /receipts/:receiptId` until the status changes, every second or two.
- The daily AI limit is used when the background run calls the model, so going over it ends as a `failed` receipt with `AI_LIMIT_EXCEEDED`, not as a 429. A retry calls the model again and counts again.
- Only the file goes to the model, as `attachmentInput` prepares it; nothing about the member or the household does.
- The model replies with decimal amounts, which the server converts to minor units with the currency's ISO 4217 exponent, rounding half away from zero; while the currency is unknown, it uses 2 (see [Money](../money.md#minor-units)). A merchant, date, or currency it can't read becomes `null`. Anything else outside the limits an edit must meet, such as an amount past `MAX_AMOUNT_CENTS` or more than `MAX_RECEIPT_ITEMS` items, fails the run with `AI_INVALID_OUTPUT`.
- Discount lines such as "Rabat" are folded into the `discountCents` of the item they reduce, and that item's `totalCents` is the amount after the discount. Discounts on the whole receipt go in the receipt's own `discountCents`.
- Each run carries its own `extraction_id`, and only a receipt still `processing` with that ID takes its result. A run that a discard or a retry overtook writes nothing.
- A receipt still `processing` 10 minutes after the run started, such as one the server stopped working on during a restart, reads as `failed` with `EXTRACTION_INTERRUPTED` and can be retried or edited.

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

### Discarding

`DELETE` removes the receipt and its items in any status but `confirmed`, even while it's `processing`. The scanned file stays as an attachment, and [cleanup](expenses.md#attachments) deletes it once nothing references it.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply, as do the AI errors from [AI provider](../decisions.md#ai-provider) on `POST /receipts` and `POST /retry`. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 409 | `RECEIPT_PROCESSING` | Editing a receipt the model is still reading |
| 409 | `RECEIPT_CONFIRMED` | Editing or discarding a confirmed receipt |
| 409 | `RECEIPT_NOT_FAILED` | Retrying a receipt that isn't `failed` |

## Storage

- `receipts`: `household_id` cascades from the household. `(attachment_id, household_id)` references `attachments (id, household_id)`, so the file is in the receipt's household; it cascades, which happens only when the household goes, because cleanup deletes only files nothing references. `(household_id, created_by_id)` references `household_membership_history`. Checks keep `status` to the four values, `failure_code` set exactly while `failed`, `extraction_id` set exactly while `processing`, a non-blank `merchant`, a three-letter `currency`, and non-negative `total_cents` and `discount_cents`. `receipts_list_idx (household_id, created_at, id)` serves the list, and `receipts_attachment_idx (attachment_id)` serves cleanup's check and the cascade.
- `receipt_items`: `receipt_id` cascades from the receipt. `quantity` is `numeric(12, 3)` and amounts are `bigint`. Checks keep a non-blank `name`, a non-negative `position` and `discount_cents`, and a positive `quantity`. `receipt_items_receipt_idx (receipt_id, position)` serves reads; positions aren't unique, so an edit can renumber them freely.
- The expense a confirmed receipt becomes, and who had which item, are stored by the later receipt tasks.
