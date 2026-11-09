import { expect } from "@playwright/test";
import { mockResetToken } from "../../src/mocks/factories";
import { SCENARIOS } from "../../src/mocks/scenarios";
import { signIn } from "../account";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const NEW_PASSWORD = "a brand new password";

// The fixture starts each test from a fresh build, with the same IDs.
const alice = SCENARIOS["signed-out"]
  .build()
  .users.find(({ email }) => email === "alice@example.com");

test.use({ scenario: "signed-out" });

test("asks for a reset link from sign-in, then signs in with a new password", async ({
  page,
}) => {
  if (!alice) {
    throw new Error("The scenario has no Alice");
  }
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL("/forgot-password");
  await expect(page).toHaveTitle("Forgot password · HomeSplit");
  await page.getByLabel("Email").fill(alice.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  await expectNoAxeViolations(page);

  // The link from the email.
  await page.goto(`/reset-password?token=${mockResetToken(alice.id)}`);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await page.getByRole("link", { name: "Sign in" }).click();

  await signIn(page, { email: alice.email, password: NEW_PASSWORD });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("explains a link that no longer works", async ({ page }) => {
  await page.goto("/reset-password?token=expired-token");
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();

  // Next.js keeps an empty route announcer with role="alert" on every page.
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This link has expired or was already used" })
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "Get a new link" }).click();
  await expect(page).toHaveURL("/forgot-password");
});
