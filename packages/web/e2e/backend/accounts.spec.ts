import { expect } from "@playwright/test";
import { signOut } from "../account";
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
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(flatUrl);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
