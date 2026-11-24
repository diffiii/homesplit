// biome-ignore-all lint/performance/noAwaitInLoops: navigations use the same browser page and must run in order.
import { expect } from "@playwright/test";
import { DEFAULT_SCENARIO, SCENARIOS } from "../../src/mocks/scenarios";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/u;
const BALANCES_URL = /\/expenses\/balances$/u;
const ANY_SWITCHER = /^Switch household, /u;

test("switches from every household screen and remembers the last household", async ({
  page,
}) => {
  // Six page loads and two axe runs take most of the default 30 s on a CI runner.
  test.slow();
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
    // Alice's share of the cabin rental.
    await expect(page.getByRole("region", { name: "Money" })).toContainText(
      "EUR 320.00"
    );
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
  const studioUrl = page.url();
  await page.goto("/");
  await expect(page).toHaveURL(studioUrl);
});

test("shows not found for a household the user isn't in and for broken links", async ({
  page,
}) => {
  const { households } = SCENARIOS[DEFAULT_SCENARIO].build();
  const id = (name: string) =>
    households.find((household) => household.name === name)?.id;
  for (const [path, heading] of [
    [`/households/${id("Book club")}`, "Household not found"],
    ["/households/not-an-id", "Household not found"],
    [`/households/${id("Flat on Piękna")}/nowhere`, "Page not found"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "Your households" }).click();
  await expect(
    page.getByRole("heading", { name: "Your households" })
  ).toBeVisible();
});

test("leaving is blocked until settled, and a deleted household is gone", async ({
  page,
}) => {
  test.slow();
  const { households } = SCENARIOS[DEFAULT_SCENARIO].build();
  const id = (name: string) =>
    households.find((household) => household.name === name)?.id;

  // Alice owes money in the cabin, so she's sent to settle up.
  await page.goto(`/households/${id("Lake cabin")}/settings`);
  await page.getByRole("button", { name: "Leave household" }).click();
  const leave = page.getByRole("alertdialog", {
    name: "Leave this household?",
  });
  await leave.getByRole("button", { name: "Leave" }).click();
  await expectNoAxeViolations(page);
  await leave.getByRole("link", { name: "Go to balances" }).click();
  await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();
  await expect(page).toHaveURL(BALANCES_URL);

  // The flat's last owner can't leave, and can't delete it with balances open.
  await page.goto(`/households/${id("Flat on Piękna")}/settings`);
  await expect(
    page.getByRole("button", { name: "Leave household" })
  ).toBeDisabled();

  // A new household has nothing to settle, so it can go.
  await page
    .getByRole("button", { name: "Switch household, Flat on Piękna" })
    .click();
  await page.getByRole("menuitem", { name: "New household" }).click();
  const create = page.getByRole("dialog", { name: "New household" });
  await create.getByLabel("Name").fill("Studio");
  await create.getByRole("button", { name: "Create" }).click();
  const switcher = page.getByRole("button", {
    name: "Switch household, Studio",
  });
  await expect(switcher).toBeVisible();
  const studioPath = new URL(page.url()).pathname;
  await page.goto(`${studioPath}/settings`);

  await page.getByRole("button", { name: "Delete household" }).click();
  const remove = page.getByRole("alertdialog", { name: "Delete “Studio”?" });
  const confirm = remove.getByRole("button", { name: "Delete household" });
  await expect(confirm).toBeDisabled();
  await remove.getByLabel("Type “Studio” to confirm").fill("Studio");
  await expectNoAxeViolations(page);
  await confirm.click();

  await expect(page).not.toHaveURL(new RegExp(studioPath, "u"));
  const next = page.getByRole("button", { name: ANY_SWITCHER });
  await expect(next).toBeVisible();
  await next.click();
  await expect(page.getByRole("menuitem", { name: "Studio" })).toHaveCount(0);
});
