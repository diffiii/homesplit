import { expect } from "@playwright/test";
import { signOut } from "../account";
import { expectNoAxeViolations } from "../axe";
import { newUser, test } from "./fixtures";

test("signs up to the first-run screen", async ({ page }) => {
  const user = newUser();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("No households yet")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("creates a household and signs back in to it", async ({ page, user }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New household" }).click();
  const dialog = page.getByRole("dialog", { name: "New household" });
  await dialog.getByLabel("Name").fill("Erin's flat");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: user.name })
  ).toContainText("owner");
  await expectNoAxeViolations(page);

  await signOut(page, user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
