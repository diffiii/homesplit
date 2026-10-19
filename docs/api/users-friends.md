# Users and friends API

Module flag: none · Tasks: #30, #31 · Contracts: [users](../../packages/contracts/src/features/users/index.ts), [friends](../../packages/contracts/src/features/friends/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| PATCH | `/api/me` | `UpdateProfileRequest` | `UserSummary` | 200 | the signed-in user |
| POST | `/api/me/friend-requests` | `CreateFriendRequest` | `FriendRequest` | 201 | the signed-in user |
| GET | `/api/me/friend-requests/incoming` | none | `FriendRequestListResponse` | 200 | the signed-in user |
| GET | `/api/me/friend-requests/sent` | none | `FriendRequestListResponse` | 200 | the signed-in user |

## Error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `USER_NOT_FOUND` | No account has the requested email. |
| 400 | `SELF_FRIEND_REQUEST` | The email is the caller's own. |
| 409 | `FRIEND_REQUEST_EXISTS` | The caller already has a pending request to this user. |
| 409 | `INCOMING_FRIEND_REQUEST_EXISTS` | This user already has a pending request to the caller. |
| 429 | `RATE_LIMITED` | The caller made more than 20 friend-request attempts in the last hour. |

## Rules

- Target: `PATCH /api/me` always updates the session user. Server-set and auth-owned fields (`id`, `email`, `emailVerified`, timestamps) are stripped from the body, so a body that holds only those answers 400 `EMPTY_PATCH`.
- Partial updates: an omitted field stays unchanged and `imageUrl: null` clears the avatar. `name` is trimmed and must then be 1 to 100 characters (never `null`), and `imageUrl` must be an `https:` URL.
- Better Auth's `/api/auth/update-user` is in `disabledPaths` and answers 404, so profile changes can't skip the `imageUrl` check.
- Sign-up: Better Auth's `databaseHooks.user.create.before` checks every new user against the same `DisplayName` and `AvatarUrl` rules (the avatar field is `image` there). `/api/auth/sign-up/email` answers 400 `VALIDATION_ERROR` for a bad value and stores the trimmed name.
- Projections: every response that nests a user selects `userSummaryColumns` from `packages/backend/src/features/users/user-projections.ts`, which maps the `image` column to `imageUrl` (`null` without an avatar) and leaves out email. Friend contexts select `friendUserColumns`, which adds `email`.
- Requester: the session user. The recipient is found by email, which the contract trims and lowercases before validating it.
- Unknown recipients answer 400 `USER_NOT_FOUND`, as decided in [Friend-request privacy](../decisions.md#friend-request-privacy).
- One request per pair: two users have at most one pending request between them, in either direction. A repeat answers 409 `FRIEND_REQUEST_EXISTS`.
- Crossed requests: if the recipient has already sent the caller a request, the new one answers 409 `INCOMING_FRIEND_REQUEST_EXISTS` and nothing is created. Clients should offer to accept the incoming request instead. It isn't accepted automatically, because this route returns a `FriendRequest`, not a `Friendship`.
- Rate limit: `POST /api/me/friend-requests` allows 20 attempts per user per hour. Every attempt counts, including ones that fail with 400, because the limit exists to slow down checking which emails have accounts. Counters live in the backend process, so a restart resets them and separate instances don't share them.
- Lists: `incoming` holds requests sent to the caller and `sent` holds requests the caller sent. In both, `user` is the other person. Lists are unpaginated and ordered by `createdAt` descending, then `id` descending.

## Storage

`friend_requests`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `requester_id` | `uuid`, not null, FK to `user.id`, `ON DELETE CASCADE` |
| `recipient_id` | `uuid`, not null, FK to `user.id`, `ON DELETE CASCADE` |
| `created_at` | `timestamptz`, not null, default `now()` |

- `friend_requests_not_self` checks `requester_id <> recipient_id`. The service rejects self requests first, so this check is only a backstop.
- `friend_requests_pair_key` is a unique index on `(least(requester_id, recipient_id), greatest(requester_id, recipient_id))`. It blocks duplicates and crossed requests alike. The service inserts with `ON CONFLICT DO NOTHING`, so concurrent requests leave one row, and the others answer 409.
- `requester_id` and `recipient_id` each have an index, for the `sent` and `incoming` lists.
