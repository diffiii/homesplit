import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const APP_DIR = fileURLToPath(new URL("../src/app", import.meta.url));
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

/** Every page's path, with route groups dropped and a placeholder for each dynamic segment. */
function pagePaths(): string[] {
  return globSync("**/page.tsx", { cwd: APP_DIR }).map((file) => {
    const segments = file
      .split("/")
      .slice(0, -1)
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
      .map((segment) => (segment.startsWith("[") ? PLACEHOLDER_ID : segment));
    return `/${segments.join("/")}`;
  });
}

// The proxy only checks that a session cookie is there, so any value gets a
// signed-in page past it to render.
const SESSION_COOKIE = "better-auth.session_token=warm-up";

// `next dev` compiles each page on its first request, which on a CI runner
// can take longer than an assertion waits. Requesting every page once before
// the tests start leaves them all compiled.
test("compiles every page", async ({ request }) => {
  test.setTimeout(300_000);
  for (const path of pagePaths()) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, so `next dev` compiles them without competing for the runner's CPUs.
    const response = await request.get(path, {
      headers: { cookie: SESSION_COOKIE },
      maxRedirects: 0,
    });
    // A redirect would mean the page never rendered, so never compiled.
    expect(response.status(), path).toBe(200);
  }
});
