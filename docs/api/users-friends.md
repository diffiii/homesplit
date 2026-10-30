# Users and friends API

Module flag: none · Tasks: #30, #31, #32, #115 · Contracts: [users](../../packages/contracts/src/features/users/index.ts), [friends](../../packages/contracts/src/features/friends/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| PATCH | `/api/me` | `UpdateProfileRequest` | `UserSummary` | 200 | the signed-in user |
| PUT | `/api/me/avatar` | `multipart/form-data` with the image in `file` | `UserSummary` | 200 | the signed-in user |
| DELETE | `/api/me/avatar` | none | none | 204 | the signed-in user |
| POST | `/api/me/friend-requests` | `CreateFriendRequest` | `FriendRequest` | 201 | the signed-in user |
| GET | `/api/me/friend-requests/incoming` | none | `FriendRequestListResponse` | 200 | the signed-in user |
| GET | `/api/me/friend-requests/sent` | none | `FriendRequestListResponse` | 200 | the signed-in user |
| POST | `/api/me/friend-requests/:requestId/accept` | none | `Friendship` | 200 | the recipient |
| POST | `/api/me/friend-requests/:requestId/decline` | none | none | 204 | the recipient |
| GET | `/api/me/friends` | none | `FriendshipListResponse` | 200 | the signed-in user |
| DELETE | `/api/me/friends/:friendshipId` | none | none | 204 | either friend |

## Error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `imageUrl` isn't the caller's own uploaded avatar, or an avatar upload has no file in `file` or has other fields. |
| 400 | `USER_NOT_FOUND` | No account has the requested email. |
| 400 | `SELF_FRIEND_REQUEST` | The email is the caller's own. |
| 409 | `FRIEND_REQUEST_EXISTS` | The caller already has a pending request to this user. |
| 409 | `INCOMING_FRIEND_REQUEST_EXISTS` | This user already has a pending request to the caller. |
| 409 | `ALREADY_FRIENDS` | The caller and this user are already friends, when sending or accepting a request. |
| 413 | `PAYLOAD_TOO_LARGE` | The avatar is over `AVATAR_MAX_BYTES` (default 10 MiB). |
| 415 | `UNSUPPORTED_FILE_TYPE` | The avatar isn't a JPEG, PNG, WebP, or HEIC that decodes. `details.allowed` lists the types. |
| 429 | `RATE_LIMITED` | The caller made more than 20 friend-request attempts in the last hour. |

## Rules

- Target: `PATCH /api/me` always updates the session user. Server-set and auth-owned fields (`id`, `email`, `emailVerified`, timestamps) are stripped from the body, so a body that holds only those answers 400 `EMPTY_PATCH`.
- Partial updates: an omitted field stays unchanged and `imageUrl: null` clears the avatar. `name` is trimmed and must then be 1 to 100 characters (never `null`), and `imageUrl` must be the URL of an avatar the caller uploaded (`S3_AVATAR_PUBLIC_URL/<their id>/<uuid>.webp`). Any other URL, another user's avatar included, answers 400 `VALIDATION_ERROR`.
- Better Auth's `/api/auth/update-user` is in `disabledPaths` and answers 404, so profile changes can't skip the `imageUrl` check.
- Sign-up: Better Auth's `databaseHooks.user.create.before` checks every new user against the same `DisplayName` and `AvatarUrl` rules (the avatar field is `image` there). `/api/auth/sign-up/email` answers 400 `VALIDATION_ERROR` for a bad value and stores the trimmed name.
- Projections: every response that nests a user selects `userSummaryColumns` from `packages/backend/src/features/users/user-projections.ts`, which maps the `image` column to `imageUrl` (`null` without an avatar) and leaves out email. Friend contexts select `friendUserColumns`, which adds `email`.
- Requester: the session user. The recipient is found by email, which the contract trims and lowercases before validating it.
- Unknown recipients answer 400 `USER_NOT_FOUND`, as decided in [Friend-request privacy](../decisions.md#friend-request-privacy).
- One request per pair: two users have at most one pending request between them, in either direction. A repeat answers 409 `FRIEND_REQUEST_EXISTS`.
- Crossed requests: if the recipient has already sent the caller a request, the new one answers 409 `INCOMING_FRIEND_REQUEST_EXISTS` and nothing is created. Clients should offer to accept the incoming request instead. It isn't accepted automatically, because this route returns a `FriendRequest`, not a `Friendship`.
- Rate limit: `POST /api/me/friend-requests` allows 20 attempts per user per hour. Every attempt counts, including ones that fail with 400, because the limit exists to slow down checking which emails have accounts. Counters live in the backend process, so a restart resets them and separate instances don't share them.
- Lists: `incoming` holds requests sent to the caller and `sent` holds requests the caller sent. In both, `user` is the other person. Lists are unpaginated and ordered by `createdAt` descending, then `id` descending.
- Friends: sending a request to someone who is already a friend, in either direction, answers 409 `ALREADY_FRIENDS`.
- Accept and decline: only the recipient answers a request. The requester gets 403 `FORBIDDEN`, and anyone else 404. Accepting deletes the request and creates the friendship in one transaction; declining only deletes the request, so the requester may send a new one at once. Both lock the request first, so concurrent answers run one at a time and every one after the first answers 404.
- Stale requests: the check for an existing friendship isn't serialized against accepting, so a new request sent while the pair's pending one is being accepted can still be created. Accepting such a request answers 409 `ALREADY_FRIENDS` and rolls back, leaving the request in place; declining removes it.
- Friend list: `friend` is the other person and `createdAt` is when the request was accepted. The list is unpaginated and ordered by the friend's name ascending, ignoring case, then by `id` ascending.
- Removal: either friend may end the friendship. Anyone else, and a repeated removal, gets 404.

## Avatars

- Upload: `PUT /api/me/avatar` takes one file in `file` (`AVATAR_UPLOAD_FIELD`). The type is detected from the content, as for [attachments](attachments.md#rules); the file name and declared type are ignored. HEIC is decoded with `heic-decode`, because sharp's prebuilt binaries can't read it.
- Processing: the image is turned upright, cropped to a centered square, and re-encoded as a 512×512 WebP, which carries no EXIF, GPS, or ICC data. Images over 50 million pixels answer 415.
- Storage: every upload gets a new key, `<userId>/<uuid>.webp`, in the public avatar bucket (`S3_AVATAR_BUCKET`), and `user.image` is set to its URL (`S3_AVATAR_PUBLIC_URL` + key), which needs no signing ([configuration](attachments.md#configuration)).
- Replacing or deleting: the profile is updated first, then the previous object is deleted. A failed deletion is logged and leaves the object behind. Only the user's own `<userId>/` objects are deleted, never an avatar set some other way. A CDN in front of the bucket, such as Cloudflare's, may keep serving a deleted avatar until its cache expires (4 hours by default on R2 custom domains); the URL is no longer in any profile by then.

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

`friendships`:

| Column | Definition |
| --- | --- |
| `id` | `uuid`, PK, default `gen_random_uuid()` |
| `user_a_id` | `uuid`, not null, FK to `user.id`, `ON DELETE CASCADE` |
| `user_b_id` | `uuid`, not null, FK to `user.id`, `ON DELETE CASCADE` |
| `created_at` | `timestamptz`, not null, default `now()` |

- One row per pair, with the smaller user ID in `user_a_id`. `friendships_ordered_pair` checks `user_a_id < user_b_id`, which also rules out self pairs, so a reversed pair can't be stored.
- `friendships_pair_key` is a unique key on (`user_a_id`, `user_b_id`). Accepting inserts with `ON CONFLICT DO NOTHING` and answers 409 `ALREADY_FRIENDS` when the pair exists.
- The pair key serves lookups by `user_a_id`, and `friendships_user_b_id_idx` serves `user_b_id`, so the friend list uses an index from either side.
