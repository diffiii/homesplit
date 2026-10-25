import { expect } from "@playwright/test";
import { openAccountMenu } from "../account";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const DARK = /\bdark\b/;

test("renames the user everywhere and remembers the theme", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await openAccountMenu(page, "Alice Nowak");
  await page.getByRole("menuitem", { name: "Account settings" }).click();

  await expect(page).toHaveURL("/account");
  await expect(page.getByLabel("Name")).toHaveValue("Alice Nowak");
  await expectNoAxeViolations(page);

  await page.getByLabel("Name").fill("Alicja Nowak");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(DARK);

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Alicja Nowak" })
  ).toContainText("owner");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(DARK);
});
