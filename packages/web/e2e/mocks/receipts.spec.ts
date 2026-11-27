import { expect } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/u;
const CARREFOUR = /^Carrefour Express/u;
const EXPENSE_URL = /\/expenses\/[0-9a-f-]+$/u;

test("assigns a receipt's items and adds it as an expense", async ({
  page,
}) => {
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/expenses/receipts`);
  await page.getByRole("link", { name: CARREFOUR }).click();

  const beer = page.getByRole("group", { name: "Who had Beer 0.5 L" });
  await beer.getByRole("button", { name: "Alice Nowak (you)" }).click();
  await beer.getByRole("button", { name: "Bartek Kowalski" }).click();
  await page.getByRole("button", { name: "One more for you" }).click();
  await expect(page.getByText("3/3 assigned")).toBeVisible();

  await page.getByRole("checkbox", { name: "Select Pizza" }).click();
  const selection = page.getByRole("region", { name: "Selected items" });
  await selection.getByRole("button", { name: "Alice Nowak (you)" }).click();
  await selection.getByRole("button", { name: "Bartek Kowalski" }).click();
  await selection.getByRole("button", { name: "Celina Wiśniewska" }).click();
  await selection
    .getByRole("button", { name: "Split between 3 people" })
    .click();

  const confirm = page.getByRole("button", { name: "Add as expense" });
  await expect(confirm).toBeEnabled();
  await expectNoAxeViolations(page);

  await confirm.click();
  await expect(page).toHaveURL(EXPENSE_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Carrefour Express" })
  ).toBeVisible();
});
