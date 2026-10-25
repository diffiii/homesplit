import { expect, type Page } from "@playwright/test";

/** Open the account menu, which shows the user's name on desktop. */
export async function openAccountMenu(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: "Account" })
    .or(page.getByRole("button", { name, exact: true }))
    .click();
}

/** Sign out through the account menu. */
export async function signOut(page: Page, name: string): Promise<void> {
  await openAccountMenu(page, name);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
}
