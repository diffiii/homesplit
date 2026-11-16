import { expect, type Page, type TestInfo } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/u;
const BOUGHT = /^Bought \(\d+\)$/u;
const APPLES = /^Apples/u;
const TEA = /^Tea/u;

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "mobile";

async function startAdding(page: Page, testInfo: TestInfo) {
  if (!isPhone(testInfo)) {
    return page.getByLabel("Item", { exact: true });
  }
  await page.getByRole("button", { name: "Add item" }).click();
  const name = page
    .getByRole("dialog", { name: "Add items" })
    .getByLabel("Item", { exact: true });
  await expect(name).toBeFocused();
  return name;
}

async function stopAdding(page: Page, testInfo: TestInfo) {
  if (isPhone(testInfo)) {
    const dialog = page.getByRole("dialog", { name: "Add items" });
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
  }
}

test("adds items in a row from the keyboard, edits one, and deletes one with a change of mind", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/shopping`);

  const list = page.getByRole("list", { name: "Shopping list" });
  const rows = list.getByRole("listitem");
  await expect(rows.first()).toContainText("Coffee beans");
  await expectNoAxeViolations(page);

  const name = await startAdding(page, testInfo);
  await name.fill("Apples");
  await name.press("Enter");
  await expect(name).toBeFocused();
  await page.keyboard.type("Flour");
  await page.keyboard.press("Tab");
  await page.keyboard.type("2");
  await page.keyboard.press("Tab");
  await page.keyboard.type("kg");
  await page.keyboard.press("Enter");
  await expect(name).toBeFocused();
  await page.keyboard.type("Tea");
  await page.keyboard.press("Enter");
  await stopAdding(page, testInfo);

  await expect(rows.nth(0)).toContainText("Tea");
  await expect(rows.nth(1)).toContainText("Flour 2 kg");
  await expect(rows.nth(2)).toContainText("Apples");
  await expect(list.locator("[aria-busy]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "To buy (6)" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Flour" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit “Flour”" });
  await dialog.getByLabel("Quantity").fill("3");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(rows.nth(1)).toContainText("Flour 3 kg");

  await page.getByRole("button", { name: "Actions for Apples" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(list.getByText("Apples")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows.nth(2)).toContainText("Apples");
  await expect(page.getByText("Deleted “Apples”")).toBeHidden();

  await page.getByRole("button", { name: "Actions for Apples" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Deleted “Apples”")).toBeVisible();
  await expectNoAxeViolations(page);
  await expect(page.getByText("Deleted “Apples”")).toBeHidden({
    timeout: 10_000,
  });
  await page.reload();
  await expect(rows.first()).toContainText("Tea");
  await expect(list.getByText("Apples")).toHaveCount(0);
});

test("adds three items, buys two, puts one back, and clears what's bought", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/shopping`);

  const list = page.getByRole("list", { name: "Shopping list" });
  const bought = page.getByRole("region", { name: BOUGHT });
  await expect(list).toContainText("Coffee beans");

  const name = await startAdding(page, testInfo);
  await name.fill("Apples");
  await name.press("Enter");
  await page.keyboard.type("Flour");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Tea");
  await page.keyboard.press("Enter");
  await stopAdding(page, testInfo);
  await expect(list.locator("[aria-busy]")).toHaveCount(0);

  await list.getByRole("button", { name: APPLES }).click();
  await list.getByRole("button", { name: TEA }).click();
  await expect(bought.getByRole("listitem").first()).toContainText("Tea");
  await expect(bought).toContainText("Apples");
  await expectNoAxeViolations(page);

  await bought.getByRole("button", { name: TEA }).click();
  await expect(list.getByRole("button", { name: TEA })).toBeVisible();
  await expect(bought.getByText("Tea")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear bought" }).click();
  await expect(bought).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(bought).toContainText("Apples");
  await expect(page.getByText("Cleared 3 items")).toBeHidden();

  await page.getByRole("button", { name: "Clear bought" }).click();
  await expect(page.getByText("Cleared 3 items")).toBeVisible();
  await expect(page.getByText("Cleared 3 items")).toBeHidden({
    timeout: 10_000,
  });
  await page.reload();
  await expect(list).toContainText("Tea");
  await expect(bought).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
});
