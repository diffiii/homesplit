import { expect } from "@playwright/test";
import { MOCK_PASSWORD } from "../../src/mocks/factories";
import { DEFAULT_SCENARIO, SCENARIOS } from "../../src/mocks/scenarios";
import { openAccountMenu, signIn, signOut } from "../account";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const FRIENDS_ITEM = /^Friends/u;
// Chrome puts a space before the visually hidden count.
const ONE_REQUEST = /^Friends ?, 1 friend request$/u;
const DAWID = /Dawid Lewandowski/u;

// The fixture starts each test from a fresh build, with the same IDs.
const flat = SCENARIOS[DEFAULT_SCENARIO]
  .build()
  .households.find(({ name }) => name === "Flat on Piękna");

test("sends, withdraws, and resends a request, which the other user accepts, then invites the friend", async ({
  page,
}) => {
  await page.goto("/households");
  await openAccountMenu(page, "Alice Nowak");
  await page.getByRole("menuitem", { name: FRIENDS_ITEM }).click();
  await expect(page).toHaveURL("/friends");
  await expect(
    page.getByRole("region", { name: "Your friends" }).getByRole("listitem")
  ).toHaveCount(2);
  await expectNoAxeViolations(page);

  const sent = page.getByRole("region", { name: "Sent requests" });
  const send = async () => {
    await page.getByLabel("Email").fill("dawid@example.com");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(sent).toContainText("Dawid Lewandowski");
  };
  await send();

  await page
    .getByRole("button", { name: "Withdraw request to Dawid Lewandowski" })
    .click();
  await expectNoAxeViolations(page);
  await page
    .getByRole("alertdialog", {
      name: "Withdraw your request to Dawid Lewandowski?",
    })
    .getByRole("button", { name: "Withdraw" })
    .click();
  await expect(sent).not.toContainText("Dawid Lewandowski");
  await send();

  await signOut(page, "Alice Nowak");
  await signIn(page, { email: "dawid@example.com", password: MOCK_PASSWORD });
  await openAccountMenu(page, "Dawid Lewandowski");
  await page.getByRole("menuitem", { name: ONE_REQUEST }).click();
  await page
    .getByRole("button", { name: "Accept request from Alice Nowak" })
    .click();
  await expect(
    page.getByRole("region", { name: "Your friends" })
  ).toContainText("alice@example.com");
  await expect(
    page.getByRole("region", { name: "Requests for you" })
  ).toHaveCount(0);

  await signOut(page, "Dawid Lewandowski");
  await signIn(page, { email: "alice@example.com", password: MOCK_PASSWORD });
  await page.goto(`/households/${flat?.id}/settings`);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByRole("checkbox", { name: DAWID }).check();
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Send invitation" }).click();

  await expect(
    page.getByRole("listitem").filter({ hasText: "dawid@example.com" })
  ).toBeVisible();
});
