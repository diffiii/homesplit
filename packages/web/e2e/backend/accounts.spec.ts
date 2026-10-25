import { expect } from "@playwright/test";
import { signIn, signOut } from "../account";
import { expectNoAxeViolations } from "../axe";
import { newUser, test } from "./fixtures";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

test("creates households, switches, and signs back in to the last opened one", async ({
  page,
  user,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New household" }).click();
  const dialog = page.getByRole("dialog", { name: "New household" });
  await dialog.getByLabel("Name").fill("  Erin's flat  ");
  const requestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/api/auth/organization/create")
  );
  await dialog.getByRole("button", { name: "Create" }).click();
  const body = (await requestPromise).postDataJSON();
  expect(Object.keys(body).sort()).toEqual(["name", "slug"]);
  expect(body.name).toBe("Erin's flat");
  expect(body.slug).toMatch(UUID);

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: user.name })
  ).toContainText("owner");
  await expectNoAxeViolations(page);

  const flatUrl = page.url();
  await page
    .getByRole("button", { name: "Switch household, Erin's flat" })
    .click();
  await page.getByRole("menuitem", { name: "New household" }).click();
  await dialog.getByLabel("Name").fill("Weekend cabin");
  await dialog.getByRole("button", { name: "Create" }).click();
  await page
    .getByRole("button", { name: "Switch household, Weekend cabin" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Weekend cabin" })
  ).toHaveAttribute("aria-current", "true");
  await page.getByRole("menuitem", { name: "Erin's flat" }).click();
  await expect(page).toHaveURL(flatUrl);
  await page.goto("/");
  await expect(page).toHaveURL(flatUrl);

  await signOut(page, user.name);
  await signIn(page, user);
  await expect(page).toHaveURL(flatUrl);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("renames the user and changes the password", async ({ page, user }) => {
  await page.goto("/account");
  await expect(page.getByLabel("Name")).toHaveValue(user.name);
  await expectNoAxeViolations(page);

  await page.getByLabel("Name").fill("  Erin Renamed ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Erin Renamed");

  const current = page.getByLabel("Current password");
  await current.fill("not the password");
  await page.getByLabel("New password").fill("a brand new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("That's not your current password.")
  ).toBeVisible();

  await current.fill(user.password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("Password changed. Your other devices are signed out.")
  ).toBeVisible();
  // This device got a new session, so it stays signed in.
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Erin Renamed");

  await signOut(page, "Erin Renamed");
  await signIn(page, { email: user.email, password: "a brand new password" });
  await expect(page.getByText("No households yet")).toBeVisible();
});
