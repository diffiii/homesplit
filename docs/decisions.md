# Decision record: households, permissions, lifecycle, and API

Backlog tasks (#20) call these "the #22 rules". Changes to this file go in their own PR, never bundled with other changes.

Better Auth behavior described here was checked against `better-auth` 1.7.7; re-check it after upgrading.

## Identity

- A household is a Better Auth organization. `householdId` is `organization.id`, and the household name is `organization.name`. HomeSplit doesn't use `slug`, `logo`, or `metadata`. Better Auth requires a unique `slug` when an organization is created, so clients send a random UUID, and no HomeSplit route accepts a slug. Better Auth's `create` and `update` accept the other two as well, and `update` accepts a new `slug`, so hooks keep them unset: `organizationHooks.beforeCreateOrganization` rejects `logo` and `metadata`, and `beforeUpdateOrganization` rejects every field but `name`, both with 400 `UNSUPPORTED_FIELD`.
- Module flags live in `household_features`, one row per organization. Its primary key `organization_id` references `organization.id`, and it has one boolean per [feature ID](../packages/contracts/src/features/catalog.ts): `expenses_enabled`, `chores_enabled`, and `shopping_enabled`, not null and default `true`. A later module adds its own column and default; `ai` (#53) defaults to `false`. The flags aren't columns on `organization`. Columns added by hand would vanish from the Drizzle schema whenever `pnpm auth:generate` rewrites it. Better Auth `additionalFields` would let `/organization/create` and `/organization/update` set flags past `PATCH /features`, and would put every new module into the auth config.
- Access is always checked against the `:householdId` in the URL. HomeSplit never reads `session.activeOrganizationId`, so household routes don't use the Nest integration's `@OrgRoles`, `@RequireActiveOrg`, or `@MemberHasPermission` decorators, which depend on it.
- Roles are Better Auth's defaults, `owner`, `admin`, and `member`, with their default permissions. Custom roles, teams, and dynamic access control stay disabled. Better Auth stores multiple roles as a comma-separated string, and checks use the strongest one.

## Membership history

Better Auth deletes the `member` row when someone leaves or is removed. Past membership is kept in `household_membership_history`:

| Column | Definition |
| --- | --- |
| `organization_id` | FK to `organization.id`, `ON DELETE CASCADE` |
| `user_id` | FK to `user.id`, `ON DELETE RESTRICT` |
| `first_joined_at` | `timestamptz`, not null |

The primary key is (`organization_id`, `user_id`). Creating a household, accepting an invitation, and rejoining insert the pair if it's missing. Leaving and removal write nothing, so the row outlives the `member` row. Rows disappear only together with their household.

History never grants a role or any access; both come only from `member`. There's no `left_at` column, because whether someone has left is derived from `member`. Add one only when a contract needs it.

These terms are used throughout:

- **Current member:** has a `member` row for the household.
- **Departed member:** has a history row but no `member` row.
- **Household party:** a current or departed member, meaning anyone with a history row.

### Keeping derived tables in sync

| Table | Maintained by | Backfilled by |
| --- | --- | --- |
| `household_features` | An `AFTER INSERT ON organization` trigger inserts the default row. | #27 migration |
| `household_membership_history` | An `AFTER INSERT ON member` trigger inserts the pair with `ON CONFLICT DO NOTHING`. | #26 migration |

Better Auth hooks can't do this reliably in 1.7.7:

- Accepting an invitation calls only the invitation hooks, not `afterAddMember`.
- `/organization/leave` calls no organization hook at all.
- Hooks run after Better Auth's write and outside any transaction with it, so a failing hook leaves a member without history.

A trigger runs in the same statement as every insert, whatever the path, including test fixtures. Triggers go in custom Drizzle migrations (`drizzle-kit generate --custom`) and are the only change HomeSplit makes to Better Auth's tables. `pnpm auth:generate` rewrites `src/db/schema.ts` in full, so application tables live in separate schema files listed in `drizzle.config.ts`.

## Roles and permissions

`all` means any current member (`member`, `admin`, or `owner`), and `admin+` means `admin` or `owner`. Non-members, departed members included, have no rights at all. A dash means the contracts have no such operation.

| Feature | Read | Create | Update | Delete | Actions |
| --- | --- | --- | --- | --- | --- |
| Household (Better Auth) | all | any signed-in user | admin+ (rename) | `owner`¹ | invite, cancel invitation, change roles², remove members²: admin+; leave: all³ |
| Module flags | all | – (automatic) | admin+⁶ | – | – |
| Expense categories | all | admin+ | admin+ | admin+⁵ | – |
| Expenses | all | all | author or admin+ | author or admin+ | – |
| Payments (settlements) | all | party or admin+⁴ | – | pending only: party or admin+⁴ | confirm: payee or admin+⁴ |
| Balances and suggestions | all | – | – | – | – |
| Chores | all | all | all | all | complete, reopen: all |
| Shopping items | all | all | all | all | purchase, unpurchase, clear purchased: all |
| Profile | self (Better Auth `get-session`) | – | self | – | – |
| Friends | self | self | – | either friend | accept, decline: recipient |

1. Only while every balance in the household is zero; see [Deleting households](#deleting-households).
2. Better Auth's rules apply: only an `owner` can invite, promote, demote, or remove an owner, and the last owner can't be demoted or removed. HomeSplit adds that nobody removes themselves; they leave instead.
3. Only with every balance settled; see [Departed members](#departed-members). Better Auth doesn't let the last `owner` leave.
4. A party is the payer or the payee. A payment recorded by its payer waits for confirmation, and nobody confirms their own payment; see [Recording payments](#recording-payments).
5. Only while no expense uses the category; see [Deleting households](#deleting-households).
6. `expenses` can't be turned off while any balance in the household isn't zero; see [Disabled modules](#disabled-modules).

The matrix follows three rules:

- Money and shared configuration are protected, while everyday lists are open to every member. Any member may record an expense paid by other members.
- The acting user always comes from the session. Server-set fields (the author, `createdBy`, `confirmedBy`, `addedBy`, `completedBy`, `purchasedBy`, and their timestamps) are never read from requests; the contract schemas strip or reject them.
- Role checks read the caller's `member` row for the household in the URL.

## Lifecycle

### Departed members

- **Access:** none, whatever their balance. Every `/api/households/:householdId/...` route answers 404, as for any non-member, and Better Auth's endpoints answer with their own errors.
- **History:** everything they authored, paid, took part in, were assigned, completed, or bought stays attributed to them through their usual `UserSummary`. Nothing is reassigned or rewritten when someone leaves, so an open chore stays assigned to them until a member reassigns it.
- **Balances:** #41 lists a departed member in a currency whenever their balance in it isn't zero, so current members see who still owes or is owed and can remind them.
- **Payments:** they can't record or confirm payments. A current member who is the other party, or an admin+, records the payment for them, and an admin+ confirms a pending payment whose payee has left.
- **Leaving:** blocked with 409 `UNSETTLED_BALANCE` while any of the member's balances in the household isn't zero, so members settle up before they leave. `/organization/leave` calls no organization hook, so the check goes in a global `hooks.before` matched on that path; verify in 1.7.7 that it can read balances and reject the request, and otherwise replace the endpoint with a HomeSplit route. That hook runs outside Better Auth's write, so an expense committed in between can leave the member departed with a balance. That's accepted, because it's the same state an admin+ removal creates and the debt stays settleable.
- **Removal:** an admin+ can remove another member whatever their balance. The balance stays, and the debt stays settleable. Nobody can remove themselves, because that would skip the leaving check: `/organization/remove-member` aimed at the caller's own membership answers 403 `CANNOT_REMOVE_SELF`. Better Auth 1.7.7 allows self-removal and doesn't pass the caller to `beforeRemoveMember`, so this check also goes in the global `hooks.before`, matched on `/organization/remove-member`. The hook doesn't rely on clients sending a convenient request. It rejects a request without `organizationId` with 400 instead of falling back to the session's active organization. It treats `memberIdOrEmail` as the caller when it's an email equal to the caller's, compared case-insensitively, or a member ID whose member in that household is the caller. Either match answers 403 `CANNOT_REMOVE_SELF`.
- **Rejoining:** accepting a new invitation makes them a current member again with the invited role, and their history continues under the same user ID.

### Deleting accounts

Better Auth's `/delete-user` stays disabled (`user.deleteUser.enabled` defaults to `false`), because it hard-deletes the `user` row and the auth tables cascade.

Account deletion keeps the `user` row and its ID but overwrites the personal data in it, built by whichever task adds `DELETE /api/me` (none is in the backlog yet). In one transaction, it:

1. Hands ownership on in every household where the user is the only `owner` and other members remain: the `admin` with the earliest `first_joined_at` becomes `owner`, or the `member` with the earliest one if there's no admin.
2. Deletes every household where the user is the last current member, with all its data and whatever its balances, because nobody can open it again: departed members have no access. It deletes the `organization` row directly, so the settled-up check in `DELETE /api/households/:householdId` doesn't apply.
3. Deletes the user's remaining `member` rows, sessions, accounts, pending invitations they sent, friend requests, and friendships.
4. Sets `name` to `Deleted user`, `email` to `deleted-<userId>@deleted.invalid`, and `image` to `null`.
5. _To be decided:_ what happens to invitations addressed to the user's email, Better Auth's `verification` rows, and free-text fields that may name the user.

Account deletion is never blocked, not even by an outstanding balance. The account and its personal data go, but in households that still have members, the user's ledger entries stay, because those members may still have claims against them; GDPR allows keeping data needed for legal claims (Art. 17(3)(e)). This is pseudonymization, not anonymization: ledger rows, chores, shopping items, and membership history keep pointing at the same user ID, and the other members still know who it was. The balance stays settleable by the other party or an admin+.

As a backstop, every foreign key from household data to `user` is `ON DELETE RESTRICT`, so hard-deleting anyone with household history fails instead of erasing it.

### Deleting households

An `owner` can delete a household through `DELETE /api/households/:householdId` only while it's settled up: every household party's balance, departed members' included, is zero. Otherwise it answers 409 `HOUSEHOLD_HAS_UNSETTLED_BALANCES`. A household with no expenses and no settlements is trivially settled. #26 adds the route, and #40 adds the balance check once balances exist.

Better Auth's `/organization/delete` can't do this safely. In 1.7.7, `beforeDeleteOrganization` runs before the deletion transaction and outside it, so an expense committed between the check and the delete would be erased by the cascade. HomeSplit's route checks and deletes in one transaction, and a global `hooks.before` rejects `/organization/delete` with 404 so clients can't use it.

Every settled-up check is serialized against ledger writes on the `organization` row:

- A settled-up check runs in the same transaction as the change it guards, after `SELECT … FROM organization WHERE id = $1 FOR UPDATE`. Under `READ COMMITTED`, the balance query after the lock sees every ledger write committed before it.
- Every transaction that writes the ledger (expenses, their child rows, and settlements) first takes `FOR SHARE` on the same row, so it waits for a check in progress and the check waits for it. A write that waited on a deletion then finds no household and answers 404.

Deleting a settled household deletes its expenses and settlements with it, since nobody is owed anything. An unsettled household stays: members settle up before leaving, an admin+ can remove members who don't and [write off](#writing-off-debts) what they still owe, and Better Auth never lets the last `owner` leave or be removed, so it keeps an owner while it has members. The only way a household loses its last member is account deletion, which then deletes the household too (see [Deleting accounts](#deleting-accounts)). Archiving is deferred.

Foreign keys in application tables delete as follows:

- **To `organization`:** `CASCADE` from every household table. The settled-up check in `DELETE /api/households/:householdId`, serialized against ledger writes, is what protects the ledger.
- **To `user`:** `RESTRICT` from every household table, including membership history, and `CASCADE` only from friend requests and friendships.
- **Expense child rows** (payers, allocation participants, and splits) cascade from their expense.
- **Expenses to categories:** `RESTRICT`. Deleting a category that any expense uses answers 409 `CATEGORY_IN_USE`; the service checks first, and the key catches races, which answer the generic 409 `CONFLICT`. Deleting a household still works, because PostgreSQL checks the key only after the cascade has removed both the expenses and the categories.

Better Auth's generated tables keep their own `CASCADE` keys. A task that stores files outside PostgreSQL (#44) also cleans up objects whose rows are gone.

### Disabled modules

- `expenses` covers categories, expenses, payments, balances, suggestions, and attachment links. `chores` and `shopping` cover their own routes.
- While a module is off, its `GET` routes keep working, and every other method answers 403 `MODULE_DISABLED`. Nothing is deleted or hidden, and turning the module back on restores everything.
- Better Auth's membership actions are never blocked. Changing flags isn't either, except that `expenses` stays on while any balance in the household isn't zero, so members can always settle up: turning it off then answers 409 `HOUSEHOLD_HAS_UNSETTLED_BALANCES`. #40 adds this check together with the one for deleting households, serialized against ledger writes the same way (see [Deleting households](#deleting-households)).

## Referenced users

| A request references | The user must be |
| --- | --- |
| A newly added expense payer or participant, or a chore assignee | A current member |
| A payer or participant already on the stored expense, in a financial replacement | A household party |
| A payment's payer or payee | A household party |
| A stored reference sent back unchanged in a `PATCH` | Anyone; it isn't re-checked |

Checking for a household party takes one lookup in `household_membership_history`. That lookup also covers ledger participation without aggregating balances: everyone in the ledger was a current member when they were added, so they have a history row.

Unknown users, users from another household, and ineligible users all get the same 400 `INVALID_REFERENCE`.

### Historical expense edits

These rules apply to #38:

- A financial replacement may keep anyone who is already a payer or allocation participant on the stored expense, in either role, even after they've left. Anyone else must be a current member.
- Removing a departed user from an expense is allowed, because it's an explicit edit by someone allowed to edit. The server never drops anyone by itself.
- Descriptive-only patches neither change nor re-validate payers and participants.

For example, A pays 90.00, split equally among A, B, and C. C pays A 30.00 and leaves. A corrects the total to 120.00 and sends payer A (120.00) and participants A, B, and C. C passes because C is already on the expense. Each split becomes 40.00, so C owes 10.00 again after leaving. That's intended: C stays in the balances until someone records the payment, and the members remind C outside the app, since C can no longer see the household.

### Recording payments

- The payer and payee are distinct household parties.
- The recorder (`createdBy`, from the session) is a current member who is the payer or the payee, or an admin+ recording between any two parties. A departed member's payment is recorded by the other party or by an admin+.
- A payment recorded by its payer is `pending` until the payee, or an admin+ other than the payer, confirms it with `POST /settlements/:settlementId/confirm`. A payment recorded by the payee, or by an admin+ who isn't the payer, is `confirmed` at once. Nobody confirms their own payment, so an admin+ paying a departed member needs another admin+ to confirm.
- Only confirmed payments count toward balances, suggestions, and every settled-up check. While a payment is pending, `DELETE /settlements/:settlementId` removes it: the payer withdraws it, or the payee or an admin+ rejects it. A confirmed payment can't be deleted, and `DELETE` answers 409 `SETTLEMENT_CONFIRMED`.
- The expenses module must be enabled. Eligibility doesn't depend on balances; #40 decides balance limits, duplicate handling, and corrections of confirmed payments.
- The contracts don't have this yet. #40 adds a `status` (`pending` or `confirmed`) with `confirmedBy` and `confirmedAt` to `Settlement`, the two routes, and their params.

### Writing off debts

There's no write-off operation. When a departed member's debt can't be collected, an admin+ settles it with ordinary payments from the debtor, which are confirmed at once because the admin isn't the payer, and writes `Write-off` in each `note`. There are two ways to do it:

- **Forgive it:** payments from the debtor to the creditors, up to what each is owed, so the creditors take the loss.
- **Split it:** one payment from the debtor to each current member, an equal share each, so everyone takes the same loss.

For example, departed D owes 30.00, A is owed 30.00, and A, B, and C are still members. Forgiving it records D→A 30.00, which leaves everyone at zero. Splitting it records D→A, D→B, and D→C for 10.00 each, which leaves A at +20.00 and B and C at −10.00.

A departed member who is owed money is written off the same way, with payments to them instead. Write-offs look like other payments in the history, and only the note tells them apart.

## API conventions

### Routes

- Application routes live under `/api/...` as full paths in the contracts endpoint map; the backend binds them through `@Route` without a Nest global prefix. Better Auth owns `/api/auth/*`, and no application route starts with `/api/auth`.
- Household routes have the shape `/api/households/:householdId/<collection>[/:<name>Id][/<action>]`. User routes start with `/api/me`, act on the session user, and never contain a user ID.
- Collections are plural kebab-case nouns, and path params use the contract names. Actions are `POST` requests to a verb segment with an empty body.

Household paths in this table are relative to `/api/households/:householdId`. Tasks may add routes with the same shapes.

| Area | Routes |
| --- | --- |
| Household | `/api/households/:householdId`: `DELETE` |
| Module flags | `/features`: `GET`, `PATCH` |
| Categories | `/expense-categories`: `GET`, `POST` · `/expense-categories/:categoryId`: `PATCH`, `DELETE` |
| Expenses | `/expenses`: `GET`, `POST` · `/expenses/:expenseId`: `GET`, `PATCH`, `DELETE` |
| Payments | `/settlements`: `GET`, `POST` · `/settlements/:settlementId`: `DELETE` · `/settlements/:settlementId/confirm`: `POST` |
| Balances | `/balances`: `GET` · `/settlement-suggestions`: `GET` |
| Chores | `/chores`: `GET`, `POST` · `/chores/:choreId`: `GET`, `PATCH`, `DELETE` · `/chores/:choreId/complete` and `/reopen`: `POST` |
| Shopping | `/shopping-items`: `GET`, `POST` · `/shopping-items/:itemId`: `GET`, `PATCH`, `DELETE` · `/shopping-items/:itemId/purchase` and `/unpurchase`: `POST` · `/shopping-items/clear-purchased`: `POST` |
| Profile | `/api/me`: `PATCH` |
| Friends | `/api/me/friends`: `GET` · `/api/me/friends/:friendshipId`: `DELETE` · `/api/me/friend-requests`: `POST` · `/api/me/friend-requests/incoming` and `/sent`: `GET` · `/api/me/friend-requests/:requestId/accept` and `/decline`: `POST` |

### Better Auth endpoints

- Households are created, listed, and renamed, and members and invitations are managed, through Better Auth's `/api/auth/organization/*` endpoints: `create`, `list`, `update`, `get-full-organization`, `list-members`, `update-member-role`, `remove-member`, `leave`, `invite-member`, `get-invitation`, `accept-invitation`, `reject-invitation`, `cancel-invitation`, and `list-invitations`. HomeSplit doesn't wrap or proxy them. Households are deleted through `DELETE /api/households/:householdId` instead, and `/organization/delete` answers 404 (see [Deleting households](#deleting-households)).
- Invitees learn about invitations by email: #28 configures `sendInvitationEmail` with a link that carries the invitation ID. The invitee opens it with `get-invitation` and answers with `accept-invitation` or `reject-invitation`. All three check that the session user's email matches the invitation's, case-insensitively, so a forwarded link is useless to anyone else.
- Sign-in requires a verified email (`emailAndPassword.requireEmailVerification`). Sign-up creates the user, emails a verification link, and answers 200 with `token: null` and no session cookie. A sign-up for a taken email gets the same answer and sends nothing, so it doesn't reveal which emails have accounts. Sign-in answers 403 `EMAIL_NOT_VERIFIED` until the link is opened.
- The link is Better Auth's `/api/auth/verify-email` on the frontend origin, so it works in any browser. Opening it verifies the email, signs the user in (`autoSignInAfterVerification`), and redirects to the `callbackURL` given at sign-up, or answers JSON without one. It expires after 24 hours (`expiresIn`); an expired or tampered link answers 401 `TOKEN_EXPIRED` or `INVALID_TOKEN`, or redirects to `callbackURL` with `?error=`. Tokens are stateless JWTs, so a used link keeps working until it expires, but on a verified user it changes nothing and signs no one in.
- A new link comes from `/api/auth/send-verification-email` with the email, which answers 200 even for an unknown or verified email and then sends nothing, or from signing in, which sends one before answering 403 (`sendOnSignIn`). That covers a link that expired or never arrived: a failed send is logged and doesn't fail sign-up, because the user row already exists and a retry would hit the taken-email case.
- Mail goes through `src/mail.ts`, chosen by `MAIL_DRIVER`: `resend` (the default) needs `RESEND_API_KEY` and `MAIL_FROM`, and the backend doesn't start without them. `log` writes each email, links included, to the console instead, for local development; tests read what it kept. The web end-to-end tests also set `AUTH_SKIP_EMAIL_VERIFICATION=true`, which turns the requirement off and creates users verified, because they sign up through the UI and can't follow the link. The backend refuses that flag unless `MAIL_DRIVER=log`.
- `list-user-invitations` requires a verified email and answers 403 `EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION` to an unverified session. Since sign-in requires one too, an unverified user has no session, and the call gets Better Auth's 400 for a missing session instead. After verification it returns the invitations sent to the user's email. In 1.7.7, the three ID-based invitation endpoints (`get-invitation`, `accept-invitation`, `reject-invitation`) skip the verification check while invitation IDs are built-in UUIDs (`advanced.database.generateId: "uuid"`, no custom `generateId`) and `requireEmailVerificationOnInvitation` is unset; both must stay that way.
- The other organization endpoints that 1.7.7 registers with this config (`set-active`, `check-slug`, `get-organization`, `get-active-member`, `get-active-member-role`, and `has-permission`) go into Better Auth's `disabledPaths`.
- Every member sees the other members' emails, because `list-members` and `get-full-organization` return them. That's accepted: invitations go by email, so housemates already share them, and hiding them would mean wrapping both endpoints.
- Clients pass `organizationId` explicitly wherever an endpoint accepts it. Without it, Better Auth falls back to the session's active organization, which `create` and `accept-invitation` still set.
- These endpoints keep Better Auth's status codes and error codes, not the ones in [Errors](#errors). In 1.7.7, for example, a caller who isn't a member gets 400 or 403 rather than 404, and `remove-member` without the right answers 401 `YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER`, so a 401 from `/api/auth/*` doesn't always mean the session is gone. Their error bodies are usually `{ code, message }`, which parses as an `ApiError` without `details`.
- #30 adds `/update-user` to Better Auth's `disabledPaths`, so profile changes go only through `PATCH /api/me` and its `imageUrl` validation.
- #30 checks sign-up the same way: `databaseHooks.user.create.before` validates `name` against `DisplayName` and `image` against `AvatarUrl`, and stores the trimmed name. A bad value makes `/api/auth/sign-up/email` answer 400 `VALIDATION_ERROR` with `details.issues` instead of a Better Auth error code. A `hooks.before` on `/sign-up/email` runs the same check, because a sign-up for a taken email skips the database hook, and a different answer would reveal that the email has an account.
- Password reset: `POST /api/auth/request-password-reset` emails a link to `/reset-password?token=…&redirectTo=…` on the frontend origin (see [Email links](#email-links)). `redirectTo` is the one the page sent, copied from the `callbackURL` of the `url` Better Auth passes, and the link leaves it out unless it's a path starting with a single `/`. The page sets the password with `POST /api/auth/reset-password` (`newPassword`, `token`). The link works for 1 hour (`resetPasswordTokenExpiresIn`) and once; a used, expired, or unknown token answers 400 `INVALID_TOKEN`. A reset signs nobody in, so the page sends the user on to `/sign-in?redirectTo=…`, and `revokeSessionsOnPasswordReset` ends every session of the user, so every device has to sign in with the new password.
- The answer to a reset request is the same for every email, known or not. A failed send is logged rather than thrown, because a 500 only for known emails would reveal them.
- Reset requests are limited twice, with counters in the backend process (a restart resets them and separate instances don't share them), as for friend requests. A visitor address (`X-Forwarded-For`, as for session addresses) may make 10 requests an hour, then gets 429 `RATE_LIMITED`; the limit doesn't look at the email, so it reveals nothing. An email address is sent at most 3 reset emails an hour. Further requests still get the usual answer and nothing is sent, because a 429 only for accounts that exist would reveal them. Requests without a known address aren't limited per address. Better Auth's own limiter, which is on in production only, applies on top.

### Responses

- `GET` returns 200, and a creating `POST` returns 201 with the created resource. `PATCH` returns 200 with the full resource, which for `PATCH /api/me` is the user's `UserSummary`, and `DELETE` returns 204 with no body.
- An action returns 200 with the resulting resource. `clear-purchased` returns `{ deletedCount }`, accepting a friend request returns the new `Friendship`, and declining returns 204.
- In a `PATCH`, an omitted field stays unchanged, `null` clears a nullable field, and `financial` replaces the whole financial spec.
- Chore, shopping-item, and payment actions are idempotent. Repeating one whose target state already holds returns 200 with the resource unchanged, keeping the original actor and time, and repeating `clear-purchased` returns `{ deletedCount: 0 }`. Friend-request actions aren't: accepting or declining deletes the request, so a repeat answers 404.

### Errors

Every error from an application route is an [`ApiError`](../packages/contracts/src/common/api-error.ts) (`{ code, message, details? }`). Clients branch on the status and `code`; `message` is English text for developers. Errors from `/api/auth/*` come from Better Auth and don't follow this section; see [Better Auth endpoints](#better-auth-endpoints).

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Path params, query, or body fail the contract schema. `details.issues` lists `{ path, message }` objects. |
| 400 | `EMPTY_PATCH` | A `PATCH` body has no fields after parsing. |
| 400 | `INVALID_REFERENCE` | An ID in the body doesn't exist in this household or isn't eligible. `details.issues` has the same shape. |
| 401 | `UNAUTHENTICATED` | There's no valid session. |
| 403 | `FORBIDDEN` | A current member lacks the role or the resource-level right. |
| 403 | `MODULE_DISABLED` | A write hits a disabled module. `details.module` names it. |
| 404 | `NOT_FOUND` | The household doesn't exist or the caller isn't a current member, a path resource isn't in this household, or the route doesn't exist. These cases look identical. |
| 409 | A feature code, or `CONFLICT` | A uniqueness or state conflict, including database unique and foreign-key violations, which never surface as 500. |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over the JSON parser's size limit (100 KB). |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | The body uses a charset or content encoding the parser can't decode. |
| 429 | `RATE_LIMITED` | The caller hit a per-user limit. |
| 500 | `INTERNAL_ERROR` | Anything unexpected. The body exposes no internals. |

Each area's route doc lists its own codes, such as `CATEGORY_IN_USE` or `USER_NOT_FOUND`. `UNSUPPORTED_FIELD`, `UNSETTLED_BALANCE`, and `CANNOT_REMOVE_SELF` are HomeSplit codes too, but HomeSplit's hooks return them from Better Auth endpoints, so they arrive from `/api/auth/*` with Better Auth's body.

Requests are checked in this order, so each failure has one predictable answer. Steps 1 to 3 run in guards, step 4 in pipes, and the rest in services.

1. Session: 401.
2. `householdId` format: 400. Current membership: 404.
3. Module enabled, for writes: 403 `MODULE_DISABLED`. Route-level role: 403 `FORBIDDEN`.
4. Remaining params, query, and body: 400 `VALIDATION_ERROR` or `EMPTY_PATCH`.
5. Path resource in this household: 404.
6. Resource-level right, such as being the expense author: 403.
7. Referenced IDs: 400 `INVALID_REFERENCE`.
8. Conflicts: 409.

### Lists

- Paginated lists take `page` (default 1) and `pageSize` (default 20, maximum 100) and return `{ items, page, pageSize, totalItems }` with the values applied. A page past the end returns 200 with empty `items` and the real `totalItems`. Items and total come from one read-only `REPEATABLE READ` transaction, so both queries see the same snapshot; under PostgreSQL's default `READ COMMITTED`, each query would see its own.
- Unpaginated lists return `{ items }`.
- Every order ends with `id`, so rows with equal sort keys never swap places between requests.
- Filters narrow a list without changing its order or pagination, and `totalItems` counts only what matches. Several filters combine with AND. An ID that isn't the household's matches nothing rather than answering an error.

| List | Order |
| --- | --- |
| Expenses | `expenseDate` desc, `createdAt` desc, `id` desc |
| Settlements | `createdAt` desc, `id` desc |
| Chores | Open before completed, deadline asc with no deadline last, `createdAt` asc, `id` asc |
| Shopping items | Unpurchased before purchased, `addedAt` asc, `id` asc |
| Categories | Name asc (case-insensitive), `id` asc |
| Friends | Friend's name asc (case-insensitive), `id` asc |
| Friend requests | `createdAt` desc, `id` desc |
| Balances and suggestions | Currency code asc; within a currency, #41 and #42 define the order, ending with the user ID |

Offset pages can shift when rows are added or removed between requests. That's accepted, because the contracts have no cursors.

## Friend-request privacy

This decision applies to #31. An unknown email gets 400 `USER_NOT_FOUND`, because it's a body value, not a path resource. Success returns 201 with a `FriendRequest` that holds a real `FriendUser`, so the response contract stays unchanged.

Why:

- A fake success would need a made-up `FriendUser` with an ID, which the contract rules out.
- A uniform 202 with no body needs a contract change and still leaks: a real request appears in the sender's sent list, and an unknown email doesn't.
- The leak exists already. With the current config, `POST /api/auth/sign-up/email` answers 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` for a registered address, to anyone, without signing in.

As a result, any signed-in user can check whether an email has an account, which is accepted for now. #31 trims and lowercases the email (Better Auth stores emails lowercased) in the `CreateFriendRequest` schema, before the email check, as `z.string().trim().toLowerCase().pipe(z.email())`, because pipes validate before the service runs and `z.email()` rejects surrounding spaces. #31 also limits `POST /api/me/friend-requests` per user, answering 429 `RATE_LIMITED` over a limit that #31 chooses.

Revisit this if sign-up stops revealing accounts. Better Auth returns a generic sign-up response when `requireEmailVerification` is on or `autoSignIn` is off. At that point, propose a uniform response and its contract change before implementing it.

## Signed-in devices

The account page lists the user's signed-in devices and signs them out through Better Auth's `/list-sessions`, `/revoke-session`, and `/revoke-other-sessions`, which HomeSplit doesn't wrap, like the other [Better Auth endpoints](#better-auth-endpoints). `/change-password` with `revokeOtherSessions: true` signs out every other device too, and gives the current one a new session.

- **Freshness:** `session.freshAge` is 0. Better Auth's default of one day makes `/list-sessions` answer 403 `SESSION_NOT_FRESH` to anyone who signed in more than a day ago, and with email and password the only way to become fresh again is signing out and back in. Listing your own devices changes nothing, so it doesn't need a recent sign-in. In 1.7.12, the only other endpoints that check freshness are `/unlink-account`, which does nothing without social sign-in, and `/delete-user`, which is disabled.
- **Account deletion must ask for the password:** with `freshAge` at 0, Better Auth treats every session as fresh, so its `/delete-user` would delete an account without the password. The account-deletion endpoint (see [Deferred](#deferred)) checks the password itself.
- **Tokens reach the browser:** `/revoke-session` takes a session token rather than an ID, so `/list-sessions` returns every session's raw token. That's accepted. The session cookie holds the token signed with `BETTER_AUTH_SECRET`, so a raw token can't be turned into a cookie, and `/revoke-session` ignores a token that belongs to another user. The `bearer` plugin, which would accept raw tokens, stays out while this holds. The web client keeps tokens only in its query cache and never shows or logs them.
- **What a device shows:** Better Auth stores `userAgent` and `ipAddress` when the session is created, the address from `x-forwarded-for` (see `advanced.ipAddress` in `auth.ts`). `updatedAt` moves only when Better Auth extends the session, at most once a day (`updateAge`), so the list shows dates rather than times. Sessions expire after seven days without use (`expiresIn`).
- `/revoke-sessions`, which also ends the current session, stays enabled but unused: it's signing out everywhere, which the account page doesn't offer.

## Email links

Emails link to three frontend pages. Each link is built as `new URL(path, FRONTEND_URL)`, never from the `url` that Better Auth passes to its email callbacks:

| Path | Sent by | Carries |
| --- | --- | --- |
| `/invitations/:invitationId` | #28, `sendInvitationEmail` | The invitation ID |
| `/verify-email?token=…&redirectTo=…` | #59, `sendVerificationEmail` | The verification token, and where to continue |
| `/reset-password?token=…&redirectTo=…` | #86, `sendResetPassword` | The reset token, and where to continue |

Why not Better Auth's `url`:

- It points at `GET /api/auth/verify-email` or `GET /api/auth/reset-password/:token`, which act and then redirect. Mail scanners open links in emails, so a scanner would verify the address, and with `autoSignInAfterVerification` it would receive a session.
- The pages tell an expired link from an invalid one and offer the next step in place, rather than decoding an `?error=` from a redirect.

Returning the user to where they were going:

- `redirectTo` is a path on the frontend origin. Pages follow it only if it starts with a single `/`, and fall back to `/` otherwise (#84).
- **Invitations.** The page is the destination itself. A signed-out visitor goes to `/sign-in?redirectTo=/invitations/:invitationId`, and switching to sign-up keeps it. Accepting doesn't need a verified email (see [Better Auth endpoints](#better-auth-endpoints)), so the invitee can accept right after signing in. If #59 requires verification before sign-in, the path travels through the verification email instead.
- **Verification.** The frontend sends its `redirectTo` as `callbackURL` to `sign-up/email` and `send-verification-email`. Better Auth puts it in the `callbackURL` query parameter of the `url` it passes to `sendVerificationEmail`, and #59 copies it into the link's `redirectTo`. The page calls `GET /api/auth/verify-email?token=…` without `callbackURL`, so it gets JSON rather than a redirect, then continues to `redirectTo`.
- **Password reset.** The forgot-password page sends its `redirectTo` as `redirectTo` to `request-password-reset`. Better Auth puts it in the `callbackURL` query parameter of the `url` it passes to `sendResetPassword`, and #86 copies it into the link's `redirectTo`. The page calls `POST /api/auth/reset-password` with the token and new password. That doesn't sign the user in, so the page then goes to `/sign-in?redirectTo=…`, unless #86 decides otherwise.

What the pages can tell apart in 1.7.7:

- Verification tokens are signed JWTs, not stored rows. An expired one answers `TOKEN_EXPIRED`, and a malformed or tampered one `INVALID_TOKEN`. Reusing a token for an address that's already verified succeeds again, so `/verify-email` can't show "already used" (#85) and shows success instead. The token doesn't depend on a session, so verifying works on another device.
- Reset tokens are stored and deleted when used, so an expired token and a used one both answer `INVALID_TOKEN`.

## Route doc template

Each epic documents its routes in `docs/api/<area>.md` (`households`, `users-friends`, `expenses`, `chores`, or `shopping`), and a task adds its routes there in the same PR. Rules from this file aren't repeated.

````markdown
# <Area> API

Module flag: `<flag or none>` · Tasks: #<n> · Contracts: [<file>](../../packages/contracts/src/features/<area>/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households/:householdId/<things>` | `List<Thing>Query` | `<Thing>ListResponse` | 200 | all |

## Rules

- Server-set fields:
- References and eligibility:
- Ordering:
- Repeated and concurrent requests:

## Errors

Shared errors from [the decision record](../decisions.md#errors) apply. Feature codes:

| Status | Code | When |
| --- | --- | --- |
| 409 | `<CODE>` | <condition> |

## Storage

Tables, constraints, foreign-key delete behavior, and indexes added by this area's migrations.
````

## Deferred

- An account-deletion endpoint, following [Deleting accounts](#deleting-accounts). It asks for the password, since every session counts as fresh (see [Signed-in devices](#signed-in-devices)).
- Archiving households.
- A write-off action that does [Writing off debts](#writing-off-debts) in one step and keeps write-offs apart from real payments.
- Custom roles and teams.
