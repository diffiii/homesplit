# Backend testing and migrations

## Running tests

```sh
pnpm db:test:up      # start the throwaway test database
pnpm test:backend    # run the backend suite once
pnpm db:test:down    # stop and remove the test database
```

Use `pnpm --filter backend test:watch` to rerun tests on save.

Tests run against the `postgres-test` service in `compose.yaml`, never against the development database:

- It listens on port **5433** (development uses 5432) with the database `homesplit_test`.
- Its data lives in memory (`tmpfs`), so stopping the container discards everything.
- It's in the compose `test` profile, so `pnpm db:up` and `pnpm db:down` don't touch it.
- Tests ignore `packages/backend/.env` and `DATABASE_URL`. To use another database, set `TEST_DATABASE_URL`. Its database name must end in `_test`, or the run stops before connecting.

CI runs the suite in the `test (backend)` job, with its own PostgreSQL service on port 5433.

## How a run works

Configuration is in `packages/backend/vitest.config.mts`. Vitest compiles through SWC, which emits the decorator metadata Nest's dependency injection needs.

1. `test/global-setup.ts` applies every migration in `src/db/migrations` once, before any test file loads. A fresh container starts empty, so each run checks that the migrations build the schema from scratch.
2. `test/setup.ts` truncates every table in the `public` schema before each test. Every test starts with empty tables and can't see data from another test.
3. Test files run one at a time, because they share one database and a truncate in one file would wipe data another file is using.

Each file that boots the app closes it in `afterAll`. That ends the database pool, so the run doesn't hang.

## Writing tests

Integration tests go in `packages/backend/test` and end in `.test.ts`. Unit tests sit next to the code in `src` and end in `.spec.ts`. The two kinds are separate Vitest projects: only `integration` uses the database, and `pnpm --filter backend test:unit` runs the unit tests without it. The helpers are in `test/helpers`:

| Helper | Gives you |
| --- | --- |
| `createTestApp()` | The Nest app configured like `main.ts`, without a listening port |
| `createClient(app)` | An unauthenticated HTTP client (supertest) |
| `createUser(app, name?)` | A signed-up user with a unique email, verified through the emailed link, and a `client` that sends their session cookie |
| `sentEmails()`, `verificationEmails(to)`, `verificationLink(to)` | What the app emailed (tests run with `MAIL_DRIVER=log`), and the newest verification link to `to` |
| `createHousehold(user, name?)` | A household owned by that user |
| `createTwoHouseholds(app)` | `alice` and `bob`, each owning a separate household |
| `inviteAndAccept(inviter, household, invitee, role?)` | `invitee` joins through Better Auth's invite and accept endpoints |
| `removeMember(remover, household, removed)` | `removed` is removed through `remove-member` |
| `leaveHousehold(user, household)` | `user` leaves through `leave` |

`HouseholdProbeModule` in `test/helpers/household-probe.ts` adds test-only routes under `/api/households/:householdId/probe` that exercise the household guard and access helpers, including probe routes under `/probe/chores` with `{ module: "chores" }` for the module-disabled check; pass it to `createTestApp`.

```ts
describe("expenses", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("hides another household's expenses", async () => {
    const { alice, bob } = await createTwoHouseholds(app);

    await alice.client
      .get(`/api/households/${bob.household.id}/expenses`)
      .expect(404);
  });
});
```

Create fixtures inside each test or in `beforeEach`, not in `beforeAll`: tables are truncated before every test, so anything made in `beforeAll` is gone by the second test. To check what reached the database, query it with `db` from `src/db`. Tests run with `STORAGE_DRIVER=memory`, so `app.get(ObjectStorage)` returns an `InMemoryObjectStorage`, whose `objects` map holds what was uploaded. Tests also run with `AI_DRIVER=fake` and `AI_DAILY_REQUEST_LIMIT=3`, so `app.get(AiClient)` returns a `FakeAiClient`: script replies with `on(task, handler)`, where a handler returns the raw reply or throws an error such as `aiTimeout()`, read what was sent in `requests`, and call `reset()` in `beforeEach`. `AiProbeModule` in `test/helpers/ai-probe.ts` adds a probe route that makes one `AiService` call. No test calls a real provider.

## Migrations

`drizzle-kit` reads `packages/backend/drizzle.config.ts`, which takes `DATABASE_URL` from `packages/backend/.env`. Run these from `packages/backend`:

| Command | What it does |
| --- | --- |
| `pnpm auth:generate` | Rewrites `src/db/schema/auth.ts` from the Better Auth config. Run it after changing `src/auth.ts` or upgrading Better Auth. |
| `pnpm db:generate` | Compares the schema files with the latest snapshot and writes a new SQL migration to `src/db/migrations`. |
| `pnpm db:generate --custom --name <name>` | Writes an empty migration for SQL that Drizzle can't generate, such as triggers. |
| `pnpm db:migrate` | Applies pending migrations to the development database. |

To change the schema:

1. Edit a schema file in `src/db/schema/`. `auth.ts` there is generated, so application tables go in one file per area (`households.ts`, `expenses.ts`, …). Export a new file from `src/db/schema/index.ts`, which both `drizzle.config.ts` and `db` read.
2. Run `pnpm db:generate` and review the generated SQL.
3. Run `pnpm db:migrate` to update your development database.
4. Run `pnpm test:backend`. The tests apply the migrations to an empty database, so a broken migration fails there.
5. Commit the schema change, the SQL file, and the updated `meta/` snapshot and journal together.

Never edit a migration that's already on `main`. Add a new one instead.
