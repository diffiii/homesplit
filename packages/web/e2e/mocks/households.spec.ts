// biome-ignore-all lint/performance/noAwaitInLoops: navigations use the same browser page and must run in order.
import { expect } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/;

test("switches from every household screen and remembers the last household", async ({
  page,
}) => {
  const activeOrganizationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/organization/set-active")) {
      activeOrganizationRequests.push(request.url());
    }
  });
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  const flatPath = new URL(page.url()).pathname;

  for (const segment of [
    "",
    "/expenses",
    "/chores",
    "/shopping",
    "/settings",
  ]) {
    await page.goto(`${flatPath}${segment}`);
    await page
      .getByRole("button", { name: "Switch household, Flat on Piękna" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Flat on Piękna" })
    ).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("menuitem", { name: "Book club" })).toHaveCount(
      0
    );
    await page.getByRole("menuitem", { name: "Lake cabin" }).click();
    await expect(
      page.getByRole("button", { name: "Switch household, Lake cabin" })
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Ewa Zielińska" })
    ).toBeVisible();
  }

  const cabinUrl = page.url();
  await page.goto("/");
  await expect(page).toHaveURL(cabinUrl);
  expect(activeOrganizationRequests).toEqual([]);
  await page
    .getByRole("button", { name: "Switch household, Lake cabin" })
    .click();
  await expectNoAxeViolations(page);
  await page.getByRole("menuitem", { name: "All households" }).click();
  await expect(
    page.getByRole("heading", { name: "Your households" })
  ).toBeVisible();
});

test("creates from the switcher and can reopen a cleared dialog", async ({
  page,
}) => {
  await page.goto("/");
  const switcher = page.getByRole("button", {
    name: "Switch household, Flat on Piękna",
  });
  await switcher.click();
  await page.getByRole("menuitem", { name: "New household" }).click();
  const dialog = page.getByRole("dialog", { name: "New household" });
  await dialog.getByLabel("Name").fill("Discard this");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await switcher.click();
  await page.getByRole("menuitem", { name: "New household" }).click();
  await expect(dialog.getByLabel("Name")).toHaveValue("");
  await dialog.getByLabel("Name").fill("  Studio  ");
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("button", { name: "Switch household, Studio" })
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Alice Nowak" })
  ).toContainText("owner");
  const studioUrl = page.url();
  await page.goto("/");
  await expect(page).toHaveURL(studioUrl);
});
