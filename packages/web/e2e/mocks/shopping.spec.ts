import { expect } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/u;

test("adds items in a row from the keyboard, edits one, and deletes one with a change of mind", async ({
  page,
}) => {
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/shopping`);

  const list = page.getByRole("list", { name: "Shopping list" });
  const rows = list.getByRole("listitem");
  await expect(rows.first()).toContainText("Coffee beans");
  await expectNoAxeViolations(page);

  const name = page.getByLabel("Item");
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

  await expect(rows.nth(0)).toContainText("Tea");
  await expect(rows.nth(1)).toContainText("Flour 2 kg");
  await expect(rows.nth(2)).toContainText("Apples");
  await expect(list.locator("[aria-busy]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "To buy · 6" })).toBeVisible();

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
