# Users and friends API

Module flag: none · Tasks: #30 · Contracts: [users](../../packages/contracts/src/features/users/index.ts), [friends](../../packages/contracts/src/features/friends/index.ts)

## Routes

| Method | Path | Request | Response | Success | Allowed |
| --- | --- | --- | --- | --- | --- |
| PATCH | `/api/me` | `UpdateProfileRequest` | `UserSummary` | 200 | the signed-in user |

## Rules

- Target: `PATCH /api/me` always updates the session user. Server-set and auth-owned fields (`id`, `email`, `emailVerified`, timestamps) are stripped from the body, so a body that holds only those answers 400 `EMPTY_PATCH`.
- Partial updates: an omitted field stays unchanged and `imageUrl: null` clears the avatar. `name` is trimmed and must then be 1 to 100 characters (never `null`), and `imageUrl` must be an `https:` URL.
- Better Auth's `/api/auth/update-user` is in `disabledPaths` and answers 404, so profile changes can't skip the `imageUrl` check.
- Sign-up: Better Auth's `databaseHooks.user.create.before` checks every new user against the same `DisplayName` and `AvatarUrl` rules (the avatar field is `image` there). `/api/auth/sign-up/email` answers 400 `VALIDATION_ERROR` for a bad value and stores the trimmed name.
- Projections: every response that nests a user selects `userSummaryColumns` from `packages/backend/src/features/users/user-projections.ts`, which maps the `image` column to `imageUrl` (`null` without an avatar) and leaves out email.
