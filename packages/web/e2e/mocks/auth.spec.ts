import { expect } from "@playwright/test";
import { MOCK_PASSWORD } from "../../src/mocks/factories";
import { signIn, signOut } from "../account";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

test.describe("signed out", () => {
  test.use({ scenario: "signed-out" });

  test("opens sign-in from the landing page, lands on a household, and signs out", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the house even." })
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in" })
      .click();
    await expect(page).toHaveURL("/sign-in");
    // Client navigation updates the title after the URL.
    await expect(page).toHaveTitle("Sign in · HomeSplit");
    await expectNoAxeViolations(page);

    await signIn(page, { email: "alice@example.com", password: MOCK_PASSWORD });

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expectNoAxeViolations(page);

    await signOut(page, "Alice Nowak");
  });
});

test.describe("new user", () => {
  test.use({ scenario: "new-user" });

  test("creates a first household", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No households yet")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "New household" }).click();
    const dialog = page.getByRole("dialog", { name: "New household" });
    await dialog.getByLabel("Name").fill("Studio");
    await expectNoAxeViolations(page);
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Switch household, Studio" })
    ).toBeVisible();
  });
});
