# Shopping API

Module flag: `shopping` · Tasks: #50 · Contracts: [shopping](../../packages/contracts/src/features/shopping/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/shopping-items` | `HouseholdIdParams`, `ListShoppingItemsQuery` | `ShoppingItemListResponse` | 200 | all |
| POST | `/api/households/:householdId/shopping-items` | `HouseholdIdParams`, `CreateShoppingItemRequest` | `ShoppingItem` | 201 | all |
| GET | `/api/households/:householdId/shopping-items/:itemId` | `ShoppingItemIdParams` | `ShoppingItem` | 200 | all |
| PATCH | `/api/households/:householdId/shopping-items/:itemId` | `ShoppingItemIdParams`, `UpdateShoppingItemRequest` | `ShoppingItem` | 200 | all |
| DELETE | `/api/households/:householdId/shopping-items/:itemId` | `ShoppingItemIdParams` | none | 204 | all |

## Rules

- Server-set fields: `id`, `householdId`, `addedBy`, `addedAt`, `isPurchased`, `purchasedBy`, and `purchasedAt`. The author is the caller, and `addedAt` is the database's time of the insert. The request schemas strip these fields, so they're ignored; a `PATCH` that holds only such fields answers 400 `EMPTY_PATCH`.
- Purchase state: new items are unpurchased, with `purchasedBy` and `purchasedAt` `null`. Neither `POST` nor `PATCH` can change it.
- Fields: `name` and `unit` are trimmed, then must be non-empty, so a blank value answers 400 `VALIDATION_ERROR`. `unit` is a free-text label such as `kg` or `pack`, not an enum; clients offer a picker with a custom value. `quantity` is an integer from 1 to 2,147,483,647, the range of the `integer` column, so a larger value answers 400 `VALIDATION_ERROR` instead of failing in the database.
- Defaults: an omitted `quantity` is 1, and an omitted `unit` is `null`.
- Partial updates: in `PATCH`, an omitted field stays unchanged and `unit: null` clears the unit. `name` and `quantity` can't be `null`. Any member may edit or delete any item, whoever added it.
- Reading back: a departed member still shows as `addedBy`. Another household's item answers 404, as a missing one does.
- Ordering and filter: unpurchased items first, then purchased ones, each by `addedAt` ascending, then `id`. Purchased items are left out unless `includePurchased=true`; the query value must be `true` or `false`. A page and its `totalItems` are read in one `readSnapshot`, and a page past the end has no items and the real `totalItems`.
- Disabled module: both `GET` routes keep working, and `POST`, `PATCH`, and `DELETE` answer 403 `MODULE_DISABLED`.
- Repeated requests: `POST` isn't idempotent, so a repeat adds a second item. A repeated `DELETE` answers 404.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. This area adds no feature codes.

## Storage

`shopping_items`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `household_id` | `uuid`, not null, FK to `organization.id`, `ON DELETE CASCADE` |
| `name` | `text`, not null |
| `quantity` | `integer`, not null |
| `unit` | `text`, nullable |
| `added_by_id` | `uuid`, not null, FK to `user.id`, `ON DELETE RESTRICT` |
| `added_at` | `timestamptz`, not null, default `now()` |
| `purchased_by_id` | `uuid`, nullable, FK to `user.id`, `ON DELETE RESTRICT` |
| `purchased_at` | `timestamptz`, nullable |

- There's no `is_purchased` column. An item is purchased while `purchased_at` is set, and `shopping_items_purchase` keeps `purchased_by_id` and `purchased_at` either both null or both set.
- `shopping_items_added_by_party_fk` and `shopping_items_purchased_by_party_fk` reference `household_membership_history` (`organization_id`, `user_id`) from (`household_id`, `added_by_id`) and (`household_id`, `purchased_by_id`), so a user from another household can't be stored. A null `purchased_by_id` isn't checked.
- Checks: `shopping_items_name_not_blank` and `shopping_items_unit_not_blank` (`~ '\S'`, at least one non-whitespace character, the rule the contract's trim enforces), and `shopping_items_quantity_positive` (`quantity >= 1`).
- `shopping_items_list_idx` on (`household_id`, `added_at`, `id`) serves the list. Sorting by purchase state happens after the index scan, which is cheap for a household's list.
- Deleting a household deletes its items.
