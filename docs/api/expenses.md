# Expenses API

Module flag: `expenses` · Tasks: #35 · Contracts: [expenses](../../packages/contracts/src/features/expenses/index.ts), [categories](../../packages/contracts/src/features/expenses/categories.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/expense-categories` | `HouseholdIdParams` | `ExpenseCategoryListResponse` | 200 | all |
| POST | `/api/households/:householdId/expense-categories` | `HouseholdIdParams`, `CreateExpenseCategoryRequest` | `ExpenseCategory` | 201 | admin+ |
| PATCH | `/api/households/:householdId/expense-categories/:categoryId` | `ExpenseCategoryIdParams`, `UpdateExpenseCategoryRequest` | `ExpenseCategory` | 200 | admin+ |
| DELETE | `/api/households/:householdId/expense-categories/:categoryId` | `ExpenseCategoryIdParams` | none | 204 | admin+ |

## Rules

- Server-set fields: `id` and `householdId`. The household always comes from the URL; both fields are stripped from request bodies.
- Icons: `icon` is a single emoji ([`Emoji`](../../packages/contracts/src/common/emoji.ts)) or `null`, and clients show it as the category's avatar. One emoji means one visible character, so skin tones, flags, keycaps, and joined sequences such as 👨‍👩‍👧 pass, while text and several emoji in a row fail with 400 `VALIDATION_ERROR`.
- Partial updates: in `PATCH`, an omitted field stays unchanged and `icon: null` clears the icon. `name` can't be `null`.
- Names: any non-empty string. Two categories in a household may share a name.
- References and eligibility: none in these routes. Routes that take a `categoryId` in the body call `assertCategoryInHousehold(executor, householdId, categoryId, path?)` from `packages/backend/src/features/expenses/categories/category-reference.ts`. A missing category and another household's both answer 400 `INVALID_REFERENCE`, with `path` (default `["categoryId"]`) in `details.issues`.
- Ordering: categories are listed by name ascending, ignoring case, then by `id`. The list is unpaginated.
- Default categories: a new household starts with Groceries 🛒, Utilities 💡, Rent 🏠, Transport 🚗, Dining out 🍽️, Entertainment 🎬, and Other 📦. They're ordinary rows that an admin+ can rename or delete. Households that existed before #35 get none.
- Repeated and concurrent requests: `POST` isn't idempotent, so a repeat creates a second category. A repeated `DELETE` answers 404. #37 adds the check that keeps a category in use from being deleted.

### Seeding default categories

Better Auth's `organizationHooks.afterCreateOrganization` in `packages/backend/src/auth.ts` calls `seedDefaultCategories`. Unlike `household_features` and `household_membership_history`, which [triggers keep in sync](../decisions.md#keeping-derived-tables-in-sync), default categories aren't an invariant: nothing breaks when a household has none. That makes the hook's limits acceptable:

- It runs after Better Auth has written the household and outside any transaction with it. A failure is logged and swallowed, so `/organization/create` still succeeds and the household starts with no categories.
- It runs only for `/organization/create`. An `organization` row inserted any other way gets no defaults.

The defaults live in `DEFAULT_CATEGORIES` in `default-categories.ts`, so changing them doesn't need a migration.

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 400 | `EMPTY_PATCH` | `PATCH /expense-categories/:categoryId` body has no fields after parsing. |
| 400 | `INVALID_REFERENCE` | A `categoryId` in a request body isn't a category of this household (#37). |
| 409 | `CATEGORY_IN_USE` | Deleting a category that an expense uses (#37). |

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
