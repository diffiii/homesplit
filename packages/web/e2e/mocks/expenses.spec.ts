import { expect } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/;
const CATEGORY_IN_URL = /[?&]category=[0-9a-f-]+/;
const EXPENSE_URL = /\/expenses\/[0-9a-f-]+\?category=/;
const LIST_URL = /\/expenses$/;
const INTERNET = /^Internet/;
const DATES_IN_URL = /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/;
const PREVIOUS = /previous/i;
const NEXT = /next/i;
const BARTEK = /^Bartek/;
const SUSHI = /^Sushi/;
const ALICE = /^Alice/;
const CELINA = /^Celina/;
const GROCERIES_RUN = /^Groceries run/;

test("scrolls, filters, and opens an expense", async ({ page }) => {
  test.slow();
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  const expensesPath = `${new URL(page.url()).pathname}/expenses`;
  await page.goto(expensesPath);

  await expect(page.getByText("Showing 20 of 26 expenses")).toBeVisible();
  await expectNoAxeViolations(page);
  // Scrolling to the end loads the next page by itself.
  await page.getByText("Showing 20 of 26 expenses").scrollIntoViewIfNeeded();
  await expect(page.getByText("Showing 26 of 26 expenses")).toBeVisible();

  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Utilities" }).click();
  await expect(page).toHaveURL(CATEGORY_IN_URL);
  await expect(page.getByText("Showing 2 of 2 expenses")).toBeVisible();

  // The filters live in the URL, so a reload keeps them.
  await page.reload();
  await expect(page.getByText("Showing 2 of 2 expenses")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Category" })).toContainText(
    "Utilities"
  );

  await page.getByRole("link", { name: INTERNET }).click();
  await expect(page).toHaveURL(EXPENSE_URL);
  await expect(page.getByRole("heading", { name: "Internet" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Split" }).getByText("Left the household")
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // Back on the list, the filters are still applied.
  await page.getByRole("link", { name: "All expenses" }).click();
  await expect(page.getByText("Showing 2 of 2 expenses")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(LIST_URL);
  await expect(page.getByText("Showing 20 of 26 expenses")).toBeVisible();
});

test("filters by a date range from the calendar", async ({ page }) => {
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/expenses`);
  await expect(page.getByText("Showing 20 of 26 expenses")).toBeVisible();

  await page.getByRole("button", { name: "Dates: Any date" }).click();
  const calendar = page.getByRole("dialog", { name: "Dates" });
  await expectNoAxeViolations(page);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  // Day buttons are named by their full date; pick yesterday through today.
  const dayName = (date: Date) =>
    date.toLocaleDateString("en-US", { dateStyle: "full" });
  if (yesterday.getMonth() !== today.getMonth()) {
    await calendar.getByRole("button", { name: PREVIOUS }).click();
  }
  await calendar.getByRole("button", { name: dayName(yesterday) }).click();
  if (yesterday.getMonth() !== today.getMonth()) {
    await calendar.getByRole("button", { name: NEXT }).click();
  }
  await calendar.getByRole("button", { name: dayName(today) }).click();

  await expect(calendar).toBeHidden();
  await expect(page.getByText("Showing 2 of 2 expenses")).toBeVisible();
  await expect(page).toHaveURL(DATES_IN_URL);
});

test("adds an expense split equally", async ({ page }) => {
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/expenses`);

  await page.getByRole("link", { name: "Add expense" }).click();
  await page.getByLabel("Name").fill("Sushi");
  await page.getByLabel("Amount").fill("90");
  await page.getByRole("checkbox", { name: BARTEK }).click();
  await expect(page.getByText("PLN 45.00")).toHaveCount(2);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { name: "Sushi" })).toBeVisible();
  await page.getByRole("link", { name: "All expenses" }).click();
  await expect(page.getByRole("link", { name: SUSHI })).toContainText(
    "You lent PLN 45.00"
  );
});

test("adds an expense paid by two people and split by percentage", async ({
  page,
}) => {
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/expenses/new`);

  await page.getByLabel("Name").fill("Groceries run");
  await page.getByLabel("Amount").fill("120");
  await page.getByRole("button", { name: "Split another way" }).click();
  const payers = page.getByRole("group", { name: "Paid by" });
  await expect(payers.getByRole("checkbox", { name: ALICE })).toBeFocused();
  await payers.getByRole("checkbox", { name: BARTEK }).click();
  await expect(
    page.getByRole("textbox", { name: "Amount you paid" })
  ).toHaveValue("60.00");

  await page.getByRole("combobox", { name: "Split" }).click();
  await page.getByRole("option", { name: "By percentage" }).click();
  const split = page.getByRole("group", { name: "Split between" });
  await split.getByRole("checkbox", { name: CELINA }).click();
  await page.getByRole("textbox", { name: "Your percentage" }).fill("75");
  await expect(split.getByText("25% over 100%.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Bartek Kowalski's percentage" })
    .fill("25");
  await expect(split.getByText("Adds up to 100%.")).toBeVisible();
  await expect(split.getByText("PLN 90.00")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(
    page.getByRole("heading", { name: "Groceries run" })
  ).toBeVisible();
  await page.getByRole("link", { name: "All expenses" }).click();
  await expect(page.getByRole("link", { name: GROCERIES_RUN })).toContainText(
    "You owe PLN 30.00"
  );
});
