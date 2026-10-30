import { expect } from "@playwright/test";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const HOUSEHOLD_URL = /\/households\/[^/]+$/u;

// A few emoji in Emojibase's format, so the picker never reaches the CDN.
const EMOJIBASE_MESSAGES = {
  groups: [
    { key: "animals-nature", message: "animals & nature", order: 3 },
    { key: "food-drink", message: "food & drink", order: 4 },
  ],
  subgroups: [],
  skinTones: [],
};
const EMOJIBASE_DATA = [
  { emoji: "🐶", label: "dog face", tags: ["dog", "pet"], group: 3 },
  { emoji: "🐱", label: "cat face", tags: ["cat", "pet"], group: 3 },
  { emoji: "🍎", label: "red apple", tags: ["apple", "fruit"], group: 4 },
].map((emoji, index) => ({ ...emoji, subgroup: 0, order: index, version: 1 }));

test("an owner gives a category a new icon", async ({ page }) => {
  // The context sees requests the mock service worker passes through; the page doesn't.
  await page
    .context()
    .route("https://cdn.jsdelivr.net/npm/emojibase-data@*/en/*.json", (route) =>
      route.fulfill({
        json: route.request().url().endsWith("/messages.json")
          ? EMOJIBASE_MESSAGES
          : EMOJIBASE_DATA,
      })
    );
  await page.goto("/households");
  await page.getByRole("link", { name: "Flat on Piękna" }).click();
  await expect(page).toHaveURL(HOUSEHOLD_URL);
  await page.goto(`${new URL(page.url()).pathname}/settings`);

  const categories = page.getByRole("region", { name: "Expense categories" });
  await categories.getByRole("button", { name: "Edit Groceries" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit “Groceries”" });
  await dialog.getByRole("button", { name: "Icon: 🛒" }).click();
  await page.getByRole("searchbox", { name: "Search emoji" }).fill("pet");
  await expect(page.getByRole("gridcell", { name: "Red apple" })).toHaveCount(
    0
  );
  // Frimousse numbers its grid's rows and columns from 0, where ARIA starts at 1,
  // and finds rows by that index to scroll, so it can't be renumbered here.
  await expectNoAxeViolations(page, {
    selector: "[frimousse-root]",
    rules: ["aria-valid-attr-value"],
  });
  await page.getByRole("gridcell", { name: "Dog face" }).click();
  await expect(dialog.getByRole("button", { name: "Icon: 🐶" })).toBeFocused();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    categories.getByRole("listitem").filter({ hasText: "Groceries" })
  ).toContainText("🐶");
});
