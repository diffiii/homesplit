# Database schema

The current branch contains an implemented authentication/organization schema and [API contracts](../packages/contracts/src/features) for application features. The first diagram reflects the [Drizzle schema](../packages/backend/src/db/schema.ts) and [initial migration](../packages/backend/src/db/migrations/0000_petite_spyke.sql). The remaining diagrams propose relational mappings for the contracts; those application tables are not implemented yet.

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
```

All implemented foreign keys use `ON DELETE CASCADE`. `verification` has no foreign keys; `session.active_organization_id` is nullable text with no enforced organization reference. Timestamp columns are PostgreSQL `timestamp` without time zone. Non-unique indexes cover `session.user_id`, `account.user_id`, `verification.identifier`, both member foreign keys, and invitation organization/email. Membership pairs are not constrained to be unique.

## Proposed household data

`USERS` is a contract projection of the implemented `user` table, with `imageUrl` mapped to `image`; it is not an additional user table. `HOUSEHOLDS` represents the contract's household scope. Whether that scope maps directly to `organization`, and where its feature flags live, remain unspecified. The expense child tables propose composite primary keys on `(expense_id, user_id)`; the contracts expose no payer, allocation-participant, or split IDs.

```mermaid
erDiagram
    USERS {
        uuid id PK
        text name
        text email "From FriendUser"
        text image_url "nullable"
    }

    HOUSEHOLDS {
        uuid id PK "Inferred from householdId"
        boolean expenses_enabled "Default true at persistence time"
        boolean chores_enabled "Default true at persistence time"
        boolean shopping_enabled "Default true at persistence time"
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
    }

    CHORES {
        uuid id PK
        uuid household_id FK
        text name
        text description "nullable"
        uuid assigned_to_id FK "nullable"
        date due_date "nullable"
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

    USERS |o..o{ CHORES : assigned
    USERS ||..o{ CHORES : adds
    USERS |o..o{ CHORES : completes

    USERS ||..o{ SHOPPING_ITEMS : adds
    USERS |o..o{ SHOPPING_ITEMS : purchases
```

## Proposed friendships

The `USERS` entity below is the same table as in the household diagram. Participant IDs are inferred: the API returns the other user from the authenticated user's perspective, rather than exposing both participants.

```mermaid
erDiagram
    USERS {
        uuid id PK
        text name
        text email
        text image_url "nullable"
    }

    FRIEND_REQUESTS {
        uuid id PK
        uuid requester_id FK "Inferred authenticated sender"
        uuid recipient_id FK "Inferred recipient resolved by email"
        timestamptz created_at
    }

    FRIENDSHIPS {
        uuid id PK
        uuid user_a_id FK "Inferred participant"
        uuid user_b_id FK "Inferred participant"
        timestamptz created_at
    }

    USERS ||..o{ FRIEND_REQUESTS : sends
    USERS ||..o{ FRIEND_REQUESTS : receives
    USERS ||..o{ FRIENDSHIPS : participant_a
    USERS ||..o{ FRIENDSHIPS : participant_b
```

## Mapping notes

- Nested `UserSummary` / `FriendUser` values map to user foreign keys; nested expense categories map to `category_id`. The three `HouseholdFeatures` flags are shown as proposed household boolean columns, all defaulting to enabled as documented in the contract.
- `PositiveMoney` stores strictly positive expense totals and settlement payments in minor units plus a currency code. Payer contributions are also strictly positive; payer, allocation, and calculated split amounts inherit the expense currency. `Cents` / `Money` remain signed primitives for values such as balances and adjustments; the calculated split response also uses signed `Cents`.
- Expenses support multiple payers. Creation and financial replacement require at least one payer and one allocation participant, with unique users within each list; payer contributions must sum to the total. Payers and allocation participants are separate sets, so a payer need not participate in the allocation. The expense response does not require nonempty payer or calculated split arrays, and does not apply the financial spec's cross-field refinements.
- Allocation input is retained separately from calculated splits so the strategy can be returned and recalculated. `allocation.method` maps to `allocation_method`; participant `basisPoints`, `shares`, `amountCents`, and `adjustmentCents` map to the corresponding strategy-specific columns above. Equal allocation uses none of those columns. Percentage basis points must sum to 10,000, exact amounts must sum to the total, and adjustments are signed amounts added after splitting the remaining total equally; validation rejects an adjustment that yields a negative share before rounding. The proposed storage uses only the column for the selected method; rounding and persistence of calculated splits remain implementation decisions.
- Descriptive expense fields can be patched independently. Financial updates replace and validate `total`, `payers`, and `allocation` together through `financial`; persisting that replacement and recalculating splits should be atomic. Clients no longer submit calculated splits.
- `MemberBalance` / `CurrencyBalances` and `SettlementSuggestion` / `CurrencySettlementSuggestions` are computed responses, not tables. Balances and suggestions are grouped by currency, and currencies are never netted. A positive member balance means the user is owed money; a negative balance means they owe money. Settlements record strictly positive payments between distinct users within a household and have no direct expense or split reference. Splits have no settlement state.
- Chore completion and shopping purchase metadata follow their state flags: open chores and unpurchased items require null actor/timestamp fields; completed chores and purchased items require both fields. The conditional columns in the diagram express those contract invariants; database checks are not implemented yet.
- Accepting a friend request removes the request and creates a friendship. There is no request status field in the current contracts.
- Organization membership and invitations already exist as `member` and `invitation`. Their mapping to the household API is not defined yet. The proposed household entity only models its inferred ID and existing feature flags. Notification contracts are empty.
- Pagination and chore/shopping boolean filters now decode raw URL query strings. They are request handling concerns and introduce no persistence columns.
- In the proposed diagrams, UUIDs, calendar dates, and UTC timestamps come from the shared contract primitives, and SQL type choices and composite keys are illustrative. Application indexes, friendship participant-pair uniqueness rules, deletion policies, and cross-household consistency checks remain unspecified. The implemented `user.email` column is already unique.

Sources: [users](../packages/contracts/src/features/users/index.ts), [households](../packages/contracts/src/features/households/index.ts), [feature catalog](../packages/contracts/src/features/catalog.ts), [expenses](../packages/contracts/src/features/expenses/index.ts), [categories](../packages/contracts/src/features/expenses/categories.ts), [settlements](../packages/contracts/src/features/expenses/settlements.ts), [chores](../packages/contracts/src/features/chores/index.ts), [shopping](../packages/contracts/src/features/shopping/index.ts), [friends](../packages/contracts/src/features/friends/index.ts), [money primitives](../packages/contracts/src/common/money.ts), [pagination](../packages/contracts/src/common/pagination.ts), and [query decoders](../packages/contracts/src/common/query.ts).
