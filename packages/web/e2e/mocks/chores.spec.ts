import { expect } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/u;
const MOP = /^Mop the hallway/u;

test("adds a chore, completes it with a change of mind, and reopens it from the completed ones", async ({
  page,
}) => {
  test.slow();
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/chores`);

  const open = page.getByRole("list", { name: "Chores", exact: true });
  const completed = page.getByRole("list", { name: "Completed chores" });
  const details = page.getByRole("dialog", { name: "Mop the hallway" });
  const toast = page.getByText("Completed “Mop the hallway”");
  await expect(open).toContainText("Take out the bins");

  await page.getByRole("button", { name: "Add chore" }).click();
  const form = page.getByRole("dialog", { name: "New chore" });
  await form.getByLabel("Name").fill("Mop the hallway");
  await form.getByRole("button", { name: "Add chore" }).click();
  await expect(form).toBeHidden();

  await open.getByRole("button", { name: MOP }).click();
  await expect(details).toBeVisible();
  await expectNoAxeViolations(page);
  await details.getByRole("button", { name: "Mark as done" }).click();
  await expect(details).toBeHidden();
  await expect(open.getByText("Mop the hallway")).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(open).toContainText("Mop the hallway");
  await expect(toast).toBeHidden();

  await open.getByRole("button", { name: MOP }).click();
  await details.getByRole("button", { name: "Mark as done" }).click();
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 10_000 });

  await page.getByRole("button", { name: "Show completed" }).click();
  await expect(completed.getByRole("button", { name: MOP })).toContainText(
    "Alice Nowak did it"
  );

  await completed.getByRole("button", { name: MOP }).click();
  await details.getByRole("button", { name: "Reopen" }).click();
  await expect(details).toBeHidden();
  await expect(open).toContainText("Mop the hallway");

  await page.reload();
  await expect(open).toContainText("Mop the hallway");
  await expect(completed.getByText("Mop the hallway")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
});
