import { expect, type Page } from "@playwright/test";

/** Open the account menu, which shows the user's name on desktop. */
export async function openAccountMenu(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: "Account" })
    .or(page.getByRole("button", { name, exact: true }))
    .click();
}

const SIGN_IN_URL = /\/sign-in(?:\?|$)/u;

/**
 * Sign in through the form on the sign-in page. Typing before React hydrates
 * is lost: hydration empties the fields, or the browser submits the form
 * itself. So it tries again until the page leaves sign-in.
 */
export async function signIn(
  page: Page,
  { email, password }: { email: string; password: string }
): Promise<void> {
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(SIGN_IN_URL, { timeout: 2000 });
  }).toPass();
}

/** Sign out through the account menu. */
export async function signOut(page: Page, name: string): Promise<void> {
  await openAccountMenu(page, name);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
}
