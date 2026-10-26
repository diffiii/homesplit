# Web testing

## Running tests

```sh
pnpm test:web              # unit and component tests, once
pnpm e2e:web               # end-to-end tests against the mock API
pnpm db:test:up            # start the throwaway test database, then
pnpm e2e:web:backend       # end-to-end tests against the real backend
```

Use `pnpm --filter web test:watch` to rerun Vitest on save, and `pnpm --filter web e2e:ui` for Playwright's UI mode. Before the first end-to-end run, install the browser with `pnpm --filter web exec playwright install chromium`.

## Unit and component tests

Configuration is in `packages/web/vitest.config.mts`, with two Vitest projects:

| Project | Files | Environment |
| --- | --- | --- |
| `unit` | `src/**/*.spec.ts` | Node |
| `components` | `src/**/*.spec.tsx` | jsdom, with `src/test/setup.ts` |

Put a spec next to the code it tests. Component tests render against the MSW mocks from `src/mocks`, the same ones `next dev` uses with `NEXT_PUBLIC_API_MOCKS=true`. Before each test, `src/test/setup.ts` loads the `households` scenario, signed in as Alice. After each test, it unmounts what was rendered and resets the route overrides, the navigation mock, and `localStorage`. A request the mocks don't handle, such as one to another origin, is an error rather than a real network call.

The helpers are in `src/test`:

| Helper | Gives you |
| --- | --- |
| `renderWithProviders(ui, { url, params })` | Testing Library's `render` inside the app's providers, with a fresh query cache that doesn't retry. Returns the render result, a `user` from `userEvent.setup()`, and the `queryClient`. |
| `expectNoAxeViolations(container?)` | Fails on WCAG 2.2 A and AA or best-practice violations in `container`, by default the whole document, so dialogs in portals are checked too. jsdom can't compute colors, so contrast is left to the end-to-end tests. |
| `db`, `server` | The mock database and MSW server. Change data through `db`, or override a route for one test with `server.use(...)`. |
| `loadScenario(name)` | Starts from another scenario, such as `new-user` or `signed-out`. |
| `signInAs(email)` | Signs in as another user in the scenario, or out with `null`. |
| `router` | What `useRouter` returns. It records calls without navigating. `usePathname`, `useSearchParams`, and `useParams` follow the `url` and `params` passed to `renderWithProviders`. |

```tsx
it("offers to create the first household", async () => {
  loadScenario("new-user");
  const { user } = renderWithProviders(<HouseholdsPage />, {
    url: "/households",
  });

  await user.click(await screen.findByRole("button", { name: "New household" }));

  expect(await screen.findByRole("dialog", { name: "New household" })).toBeVisible();
  await expectNoAxeViolations();
});
```

## End-to-end tests

Tests are in `packages/web/e2e` and run in Chromium. Playwright starts the servers it needs on ports of their own, with `next dev` building into `.next-e2e`, so they can run while `pnpm dev:web` is running. The mock and backend runs share that directory, so run them one at a time.

### Against the mocks

`pnpm e2e:web` uses `playwright.config.ts` and runs `e2e/mocks` twice: in the `mobile` project at a 360 px wide viewport, and in the `desktop` project at 1280 px. `next dev` runs with the mocks on port 3100.

Import `test` from `e2e/mocks/fixtures.ts`. Each test's browser starts from a fresh copy of a mock scenario with no latency. The default is `households`; pick another with `test.use({ scenario: "new-user" })`.

### Against the backend

`pnpm e2e:web:backend` uses `playwright.backend.config.ts` and runs `e2e/backend` in the `backend` project. Playwright migrates the database, then starts the backend on port 8180 and `next dev` on port 3200, with `/api/*` rewritten to the backend. It uses the backend tests' database on port 5433 (see [Backend testing](backend-testing.md)), or `TEST_DATABASE_URL`, whose database name must end in `_test`. Don't run it at the same time as `pnpm test:backend`, which empties the tables before every test.

The database isn't emptied between runs, so tests never rely on what's in it. Import `test` from `e2e/backend/fixtures.ts`. Its `user` fixture signs up a new user with a unique email and signs the page in as them. For signing up through the form, `newUser()` gives a name and email no other test uses.

### Shared helpers

| Helper | Gives you |
| --- | --- |
| `expectNoAxeViolations(page, known?)` in `e2e/axe.ts` | Fails on WCAG 2.2 A and AA or best-practice violations, checking the page in dark and then light mode, so contrast is checked in both. `known` skips rules a third-party widget breaks, only inside its `selector`. |
| `signOut(page, name)` in `e2e/account.ts` | Signs out through the account menu, from the mobile top bar or the desktop sidebar. |

On failure, Playwright keeps a trace in `packages/web/test-results`. Open it with `pnpm --filter web exec playwright show-trace <path>`.

## CI

`test (web)` runs the unit and component tests on every pull request. `e2e (web)` runs the end-to-end tests against the mocks on pull requests that touch `packages/web`, `packages/contracts`, or the workspace's dependencies. `e2e (web, backend)` runs them against the backend, with its own PostgreSQL service, on pull requests that touch any of those or `packages/backend`. Both always run on pushes to `main`, and upload the Playwright report and traces as artifacts.
