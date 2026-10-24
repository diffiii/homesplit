# Database schema

The current branch contains an implemented authentication/organization schema and [API contracts](../packages/contracts/src/features) for application features. The first diagram reflects the [Drizzle schema](../packages/backend/src/db/schema) and the [migrations](../packages/backend/src/db/migrations). The remaining diagrams propose relational mappings for the contracts; those application tables are not implemented yet.

`PK` = primary key, `FK` = foreign key, `UK` = unique key. Attribute comments mark nullable fields. Relationships show whether a referenced entity is required (`||`) or optional (`|o`); each referenced entity can have zero or many associated records (`o{`).

## Implemented database tables

```mermaid
erDiagram
    user {
        uuid id PK
        text name
        text email UK
        boolean email_verified "Default false"
        text image "nullable"
        timestamp created_at
        timestamp updated_at
    }

    session {
        uuid id PK
        timestamp expires_at
        text token UK
        timestamp created_at
        timestamp updated_at
        text ip_address "nullable"
        text user_agent "nullable"
        uuid user_id FK
        text active_organization_id "nullable; no FK"
    }

    account {
        uuid id PK
        text account_id
        text provider_id
        uuid user_id FK
        text access_token "nullable"
        text refresh_token "nullable"
        text id_token "nullable"
        timestamp access_token_expires_at "nullable"
        timestamp refresh_token_expires_at "nullable"
        text scope "nullable"
        text password "nullable"
        timestamp created_at
        timestamp updated_at
    }

    verification {
        uuid id PK
        text identifier
        text value
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    organization {
        uuid id PK
        text name
        text slug UK
        text logo "nullable"
        timestamp created_at
        text metadata "nullable"
    }

    member {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        text role "Default member"
        timestamp created_at
    }

    invitation {
        uuid id PK
        uuid organization_id FK
        text email
        text role "nullable"
        text status "Default pending"
        timestamp expires_at
        timestamp created_at
        uuid inviter_id FK
    }

    user ||..o{ session : has
    user ||..o{ account : has
    user ||..o{ member : joins_through
    user ||..o{ invitation : sends
    organization ||..o{ member : has
    organization ||..o{ invitation : has

    household_membership_history {
        uuid organization_id PK,FK
        uuid user_id PK,FK
        timestamptz first_joined_at
    }

    household_features {
        uuid organization_id PK,FK
        boolean expenses_enabled "Default true"
        boolean chores_enabled "Default true"
        boolean shopping_enabled "Default true"
    }

    expense_categories {
        uuid id PK
        uuid household_id FK "organization.id"
        text name
        text icon "nullable; a single emoji"
    }

    settlements {
        uuid id PK
        uuid household_id FK "organization.id"
        uuid payer_id FK
        uuid payee_id FK
        uuid created_by_id FK
        bigint amount_cents "Strictly positive"
        text currency "ISO 4217"
        text note "nullable"
        timestamptz created_at "Default now()"
        uuid confirmed_by_id FK "null while pending"
        timestamptz confirmed_at "null while pending"
    }

    expenses {
        uuid id PK
        uuid household_id FK "organization.id"
        text name
        text description "nullable"
        bigint total_amount_cents "Strictly positive"
        text currency "ISO 4217"
        text allocation_method "equal, percentage, shares, exact, adjustment"
        uuid author_id FK
        uuid category_id FK "nullable"
        date expense_date
        timestamptz created_at "Default now()"
        timestamptz updated_at "Default now()"
    }

    expense_payers {
        uuid expense_id PK,FK
        uuid household_id FK "organization.id"
        uuid user_id PK,FK
        bigint amount_cents "Strictly positive"
    }

    expense_allocation_participants {
        uuid expense_id PK,FK
        uuid household_id FK "organization.id"
        uuid user_id PK,FK
        text allocation_method FK "The expense's"
        bigint value "nullable; the method's input, null for equal"
    }

    expense_splits {
        uuid expense_id PK,FK
        uuid household_id FK "organization.id"
        uuid user_id PK,FK
        bigint amount_cents "Calculated; nonnegative"
    }

    attachments {
        uuid id PK
        uuid household_id FK "organization.id"
        text storage_key UK "Server-generated"
        text mime_type "Detected from content"
        bigint size_bytes "Strictly positive"
        uuid uploaded_by_id FK
        timestamptz created_at "Default now()"
    }

    storage_object_deletions {
        text storage_key PK
        timestamptz queued_at "Default now()"
    }

    friend_requests {
        uuid id PK
        uuid requester_id FK "user.id"
        uuid recipient_id FK "user.id"
        timestamptz created_at
    }

    friendships {
        uuid id PK
        uuid user_a_id FK "user.id; smaller of the pair"
        uuid user_b_id FK "user.id; larger of the pair"
        timestamptz created_at
    }

    organization ||..o| household_features : toggles
    organization ||..o{ household_membership_history : remembers
    user ||..o{ household_membership_history : was_member
    organization ||..o{ expense_categories : contains
    organization ||..o{ settlements : contains
    user ||..o{ settlements : pays
    user ||..o{ settlements : receives
    user ||..o{ settlements : records
    user |o..o{ settlements : confirms
    household_membership_history ||..o{ settlements : party_to
    organization ||..o{ expenses : contains
    expense_categories |o..o{ expenses : categorizes
    user ||..o{ expenses : authors
    expenses ||..o{ expense_payers : funded_by
    expenses ||..o{ expense_allocation_participants : allocated_to
    expenses ||..o{ expense_splits : has
    household_membership_history ||..o{ expense_payers : party_to
    household_membership_history ||..o{ expense_allocation_participants : party_to
    household_membership_history ||..o{ expense_splits : party_to
    user ||..o{ friend_requests : sends
    user ||..o{ friend_requests : receives
    user ||..o{ friendships : participant_a
    user ||..o{ friendships : participant_b
    organization ||..o{ attachments : stores
    user ||..o{ attachments : uploads
    household_membership_history ||..o{ attachments : party_to
```

`household_membership_history` keeps everyone who has ever been a member, after Better Auth deletes their `member` row; an `AFTER INSERT ON member` trigger fills it (see [Households API](api/households.md#storage)). Its `user_id` key is `ON DELETE RESTRICT`. `household_features` holds one row per organization with module toggles; an `AFTER INSERT ON organization` trigger seeds defaults (same doc). `expense_categories` holds each household's categories, unique on (`household_id`, `id`); new households get a default set from a Better Auth hook (see [Expenses API](api/expenses.md#storage)). `settlements` holds payments between household parties: its user keys are `ON DELETE RESTRICT`, and (`household_id`, `payer_id`) and (`household_id`, `payee_id`) also reference `household_membership_history`; an index on (`household_id`, `created_at`, `id`) serves the history, and indexes on (`household_id`, `payer_id`) and (`household_id`, `payee_id`) serve one party's payments (same doc). `expenses` and its child tables `expense_payers`, `expense_allocation_participants`, and `expense_splits` hold the ledger's expenses (same doc): user keys are `ON DELETE RESTRICT`; (`household_id`, `author_id`) and each child's (`household_id`, `user_id`) reference `household_membership_history`; (`household_id`, `category_id`) references `expense_categories` (`household_id`, `id`) with `ON DELETE RESTRICT`; children reference `expenses` by (`expense_id`, `household_id`) and cascade from both the expense and `organization`; participants also reference the expense's `allocation_method` with `ON UPDATE CASCADE`. `friend_requests` holds pending friend requests, with at most one per pair of users in either direction, and `friendships` holds accepted ones, one row per pair with the smaller user ID first (see [Users and friends API](api/users-friends.md#storage)). `attachments` holds files stored for a household in S3-compatible object storage (see [Attachments API](api/attachments.md#storage)): `uploaded_by_id` is `ON DELETE RESTRICT`, and (`household_id`, `uploaded_by_id`) references `household_membership_history`; an `AFTER DELETE ON attachments` trigger queues each deleted row's `storage_key` in `storage_object_deletions`, which has no foreign keys, so cleanup can delete the object even after its household is gone. Every other implemented foreign key uses `ON DELETE CASCADE`. `verification` has no foreign keys; `session.active_organization_id` is nullable text with no enforced organization reference. Timestamp columns are PostgreSQL `timestamp` without time zone. Non-unique indexes cover `session.user_id`, `account.user_id`, `verification.identifier`, both member foreign keys, and invitation organization/email. Membership pairs are not constrained to be unique.

## Proposed household data

`USERS` is a contract projection of the implemented `user` table, with `imageUrl` mapped to `image`; it is not an additional user table. `HOUSEHOLDS` represents the contract's household scope as `organization.id` (`householdId`); module flags live in the implemented `household_features` table, not on `organization`. The expense child tables propose composite primary keys on `(expense_id, user_id)`; the contracts expose no payer, allocation-participant, or split IDs.

```mermaid
erDiagram
    USERS {
        uuid id PK
        text name
        text email "From FriendUser"
        text image_url "nullable"
    }

    HOUSEHOLDS {
        uuid id PK "Maps to organization.id"
    }

    EXPENSE_CATEGORIES {
        uuid id PK
        uuid household_id FK
        text name
        text icon "nullable"
    }

    EXPENSES {
        uuid id PK
        uuid household_id FK
        text name
        text description "nullable"
        bigint total_amount_cents "Strictly positive"
        text currency "ISO 4217"
        text allocation_method "equal, percentage, shares, exact, adjustment"
        uuid author_id FK
        uuid category_id FK "nullable"
        date expense_date
        timestamptz created_at
        timestamptz updated_at
    }

    EXPENSE_PAYERS {
        uuid expense_id PK,FK "Inferred from nested payers"
        uuid user_id PK,FK
        bigint amount_cents "Strictly positive; currency from expense"
    }

    EXPENSE_ALLOCATION_PARTICIPANTS {
        uuid expense_id PK,FK "Inferred from nested allocation"
        uuid user_id PK,FK
        integer basis_points "nullable; percentage only, 1 to 10000"
        bigint shares "nullable; shares only, strictly positive"
        bigint exact_amount_cents "nullable; exact only, nonnegative"
        bigint adjustment_cents "nullable; adjustment only, signed"
    }

    EXPENSE_SPLITS {
        uuid expense_id PK,FK "Inferred from nested splits"
        uuid user_id PK,FK
        bigint amount_cents "Calculated; signed contract type; currency from expense"
    }

    SETTLEMENTS {
        uuid id PK
        uuid household_id FK
        uuid payer_id FK
        uuid payee_id FK
        uuid created_by_id FK
        bigint amount_cents "Strictly positive"
        text currency "ISO 4217"
        text note "nullable"
        timestamptz created_at
        uuid confirmed_by_id FK "null while pending"
        timestamptz confirmed_at "null while pending"
    }

    CHORES {
        uuid id PK
        uuid household_id FK
        text name
        text description "nullable"
        uuid assigned_to_id FK "nullable"
        timestamptz due_at "nullable; UTC deadline"
        uuid added_by_id FK
        boolean is_completed
        timestamptz completed_at "null when open; required when completed"
        uuid completed_by_id FK "null when open; required when completed"
        timestamptz created_at
        timestamptz updated_at
    }

    SHOPPING_ITEMS {
        uuid id PK
        uuid household_id FK
        text name
        integer quantity "Minimum 1; creation default 1"
        text unit "nullable"
        boolean is_purchased
        uuid added_by_id FK
        uuid purchased_by_id FK "null when unpurchased; required when purchased"
        timestamptz added_at
        timestamptz purchased_at "null when unpurchased; required when purchased"
    }

    HOUSEHOLDS ||..o{ EXPENSE_CATEGORIES : contains
    HOUSEHOLDS ||..o{ EXPENSES : contains
    HOUSEHOLDS ||..o{ SETTLEMENTS : contains
    HOUSEHOLDS ||..o{ CHORES : contains
    HOUSEHOLDS ||..o{ SHOPPING_ITEMS : contains

    EXPENSE_CATEGORIES |o..o{ EXPENSES : categorizes
    EXPENSES ||..o{ EXPENSE_PAYERS : funded_by
    EXPENSES ||..o{ EXPENSE_ALLOCATION_PARTICIPANTS : allocated_to
    EXPENSES ||..o{ EXPENSE_SPLITS : has
    USERS ||..o{ EXPENSE_PAYERS : contributes
    USERS ||..o{ EXPENSE_ALLOCATION_PARTICIPANTS : allocated
    USERS ||..o{ EXPENSE_SPLITS : participates
    USERS ||..o{ EXPENSES : authors

    USERS ||..o{ SETTLEMENTS : pays
    USERS ||..o{ SETTLEMENTS : receives
    USERS ||..o{ SETTLEMENTS : records
    USERS |o..o{ SETTLEMENTS : confirms

    USERS |o..o{ CHORES : assigned
    USERS ||..o{ CHORES : adds
    USERS |o..o{ CHORES : completes

    USERS ||..o{ SHOPPING_ITEMS : adds
    USERS |o..o{ SHOPPING_ITEMS : purchases
```

## Proposed attachments and receipts

These tables support backlog tasks [4.3](backlog/tasks/4-expenses/4.3-attachments/4.3.0-epic.md) and [7](backlog/tasks/7-ai-receipts/7.0-epic.md) and have no contracts yet. `HOUSEHOLDS`, `USERS`, `EXPENSES`, and `SHOPPING_ITEMS` are the entities from the household diagram. `ATTACHMENTS` is the implemented `attachments` table (#44).

```mermaid
erDiagram
    ATTACHMENTS {
        uuid id PK "Maps to attachments.id"
    }

    EXPENSE_ATTACHMENTS {
        uuid expense_id PK,FK
        uuid attachment_id PK,FK
    }

    RECEIPTS {
        uuid id PK
        uuid household_id FK
        uuid attachment_id FK
        text status "processing, ready, failed, confirmed"
        text merchant "nullable"
        date purchased_on "nullable"
        text currency "nullable until extracted; ISO 4217"
        bigint total_cents "nullable until extracted"
        bigint discount_cents "Receipt-level; default 0"
        uuid expense_id FK "nullable; set on confirm"
        uuid created_by_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    RECEIPT_ITEMS {
        uuid id PK
        uuid receipt_id FK
        integer position
        text name
        numeric quantity "Decimal for weighed products"
        bigint unit_price_cents
        bigint discount_cents "Line discount; default 0"
        bigint total_cents "After line discount"
    }

    RECEIPT_ITEM_ASSIGNMENTS {
        uuid receipt_item_id PK,FK
        uuid user_id PK,FK
        numeric shares "Strictly positive; units or equal shares"
    }

    HOUSEHOLDS ||..o{ RECEIPTS : contains
    USERS ||..o{ RECEIPTS : creates
    EXPENSES ||..o{ EXPENSE_ATTACHMENTS : has
    ATTACHMENTS ||..o{ EXPENSE_ATTACHMENTS : linked_by
    ATTACHMENTS ||..o{ RECEIPTS : scanned_from
    EXPENSES |o..o| RECEIPTS : created_from
    RECEIPTS ||..o{ RECEIPT_ITEMS : contains
    RECEIPT_ITEMS ||..o{ RECEIPT_ITEM_ASSIGNMENTS : assigned_by
    USERS ||..o{ RECEIPT_ITEM_ASSIGNMENTS : assigned
```

- Confirming a receipt creates an ordinary expense with the `exact` allocation method. Item assignments are kept on the receipt as the history of who had what, and the expense's splits remain the only source for balances.
- Item costs are split by shares, receipt-level discounts are spread over items in proportion to their cost, and per-person totals are rounded once with the allocation engine's remainder rule.
- Shopping matches from task 7.5 are request-time suggestions, not stored relations. Confirming them reuses the shopping purchase columns.

## Mapping notes

- Nested `UserSummary` / `FriendUser` values map to user foreign keys; nested expense categories map to `category_id`. The three `HouseholdFeatures` flags are shown as proposed household boolean columns, all defaulting to enabled as documented in the contract.
- `PositiveMoney` stores strictly positive expense totals and settlement payments in minor units plus a currency code. Payer contributions are also strictly positive; payer, allocation, and calculated split amounts inherit the expense currency. `Cents` / `Money` remain signed primitives for values such as balances and adjustments; the calculated split response also uses signed `Cents`.
- Expenses support multiple payers. Creation and financial replacement require at least one payer and one allocation participant, with unique users within each list; payer contributions must sum to the total. Payers and allocation participants are separate sets, so a payer need not participate in the allocation. The expense response does not require nonempty payer or calculated split arrays, and does not apply the financial spec's cross-field refinements.
- Allocation input is retained separately from calculated splits so the strategy can be returned and recalculated. `allocation.method` maps to `allocation_method`; participant `basisPoints`, `shares`, `amountCents`, and `adjustmentCents` map to the corresponding strategy-specific columns above. Equal allocation uses none of those columns. Percentage basis points must sum to 10,000, exact amounts must sum to the total, and adjustments are signed amounts added after splitting the remaining total equally; validation rejects an adjustment that yields a negative share before rounding. The proposed storage uses only the column for the selected method; rounding and persistence of calculated splits remain implementation decisions.
- Descriptive expense fields can be patched independently. Financial updates replace and validate `total`, `payers`, and `allocation` together through `financial`; persisting that replacement and recalculating splits should be atomic. Clients no longer submit calculated splits.
- `MemberBalance` / `CurrencyBalances`, `UserHouseholdBalance` / `UserCurrencyBalances`, and `SettlementSuggestion` / `CurrencySettlementSuggestions` are computed responses, not tables. Balances and suggestions are grouped by currency, and currencies are never netted. A positive member balance means the user is owed money; a negative balance means they owe money. Settlements record strictly positive payments between distinct users within a household and have no direct expense or split reference. A settlement's `status` isn't stored: it's `pending` while `confirmed_at` is null, and `confirmedBy` / `confirmedAt` map to `confirmed_by_id` / `confirmed_at`. Splits have no settlement state.
- Chore `dueAt` is a nullable ISO 8601 UTC datetime (for example, `2026-10-06T16:00:00Z`), mapped to `timestamptz due_at`. Creation and updates may omit the deadline; an explicit null clears it. Clients convert local deadline input to UTC and display it in the user's local time zone. Date-only values are not accepted; expense `expenseDate` remains a calendar date.
- Chore completion and shopping purchase metadata follow their state flags: open chores and unpurchased items require null actor/timestamp fields; completed chores and purchased items require both fields. The conditional columns in the diagram express those contract invariants. The `chores_completion` check enforces the chore one; the shopping check is not implemented yet.
- Organization membership and invitations already exist as `member` and `invitation`. Their mapping to the household API is not defined yet. The proposed household entity only models its inferred ID and existing feature flags. Notification contracts are empty.
- Pagination and chore/shopping boolean filters now decode raw URL query strings. They are request handling concerns and introduce no persistence columns.
- In the proposed diagrams, UUIDs, calendar dates, and UTC timestamps come from the shared contract primitives, and SQL type choices and composite keys are illustrative. Application indexes, deletion policies, and cross-household consistency checks remain unspecified. The implemented `user.email` column is already unique.

Sources: [users](../packages/contracts/src/features/users/index.ts), [households](../packages/contracts/src/features/households/index.ts), [feature catalog](../packages/contracts/src/features/catalog.ts), [expenses](../packages/contracts/src/features/expenses/index.ts), [categories](../packages/contracts/src/features/expenses/categories.ts), [settlements](../packages/contracts/src/features/expenses/settlements.ts), [chores](../packages/contracts/src/features/chores/index.ts), [shopping](../packages/contracts/src/features/shopping/index.ts), [friends](../packages/contracts/src/features/friends/index.ts), [money primitives](../packages/contracts/src/common/money.ts), [pagination](../packages/contracts/src/common/pagination.ts), and [query decoders](../packages/contracts/src/common/query.ts).
