import { expect } from "@playwright/test";
import { MOCK_PASSWORD } from "../../src/mocks/factories";
import { openAccountMenu, signIn, signOut } from "../account";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

const FRIENDS_ITEM = /^Friends/u;
// Chrome puts a space before the visually hidden count.
const ONE_REQUEST = /^Friends ?, 1 friend request$/u;

test("sends, withdraws, and resends a request, which the other user accepts", async ({
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
});
