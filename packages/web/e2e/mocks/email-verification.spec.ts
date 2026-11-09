import { expect } from "@playwright/test";
import {
  MOCK_EXPIRED_VERIFY_TOKEN,
  mockVerifyToken,
} from "../../src/mocks/factories";
import { SCENARIOS } from "../../src/mocks/scenarios";
import { signOut } from "../account";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

// The fixture starts each test from a fresh build, with the same IDs.
const alice = SCENARIOS["signed-out"]
  .build()
  .users.find(({ email }) => email === "alice@example.com");

test.use({ scenario: "signed-out" });

test("verifies from the emailed link, continues, and knows a used link", async ({
  page,
}) => {
  if (!alice) {
    throw new Error("The scenario has no Alice");
  }
  const link = `/verify-email?token=${mockVerifyToken(alice.id)}&redirectTo=%2Fhouseholds`;
  await page.goto(link);

  await expect(
    page.getByRole("heading", { name: "Email verified" })
  ).toBeVisible();
  await expect(page).toHaveTitle("Verify your email · HomeSplit");
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL("/households");
  await expect(
    page.getByRole("link", { name: "Flat on Piękna" })
  ).toBeVisible();

  // Opened again where nobody is signed in, as on another device.
  await signOut(page, alice.name);
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "This link was already used" })
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("explains an expired link", async ({ page }) => {
  await page.goto(`/verify-email?token=${MOCK_EXPIRED_VERIFY_TOKEN}`);

  await expect(
    page.getByRole("heading", { name: "This link has expired" })
  ).toBeVisible();
  await expectNoAxeViolations(page);
});
