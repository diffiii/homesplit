import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";

export const TEST_PASSWORD = "correct-horse-battery-staple";

export interface TestUser {
  email: string;
  name: string;
  password: string;
}

/** A name and an email no other test uses, for signing up. */
export function newUser(name = "Erin Example"): TestUser {
  return {
    name,
    email: `e2e-${randomUUID()}@test.local`,
    password: TEST_PASSWORD,
  };
}

/** Playwright's `test`, with `user` signed up and signed in before the test starts. */
export const test = base.extend<{ user: TestUser }>({
  user: async ({ page, baseURL }, use) => {
    const user = newUser();
    // `page.request` shares the page's cookies, so the page is signed in too.
    // Better Auth checks the origin of cookie-setting requests.
    const response = await page.request.post("/api/auth/sign-up/email", {
      data: user,
      headers: { Origin: baseURL ?? "" },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await use(user);
  },
});
