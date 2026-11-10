import { expect } from "@playwright/test";
import { DEFAULT_SCENARIO, SCENARIOS } from "../../src/mocks/scenarios";
import { expectNoAxeViolations } from "../axe";
import { test } from "./fixtures";

// The fixture starts each test from a fresh build, with the same IDs.
const scenario = SCENARIOS[DEFAULT_SCENARIO].build();

function invitationTo(email: string) {
  const invitation = scenario.invitations.find(
    (candidate) => candidate.email === email
  );
  if (!invitation) {
    throw new Error(`The scenario has no invitation for ${email}`);
  }
  return invitation;
}

function householdNamed(name: string) {
  const household = scenario.households.find(
    (candidate) => candidate.name === name
  );
  if (!household) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return household;
}

test("joins a household from the invitation link", async ({ page }) => {
  const invitation = invitationTo("alice@example.com");
  await page.goto(`/invitations/${invitation.id}`);

  await expect(
    page.getByRole("heading", { name: "Join Book club" })
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Join household" }).click();

  await expect(page).toHaveURL(`/households/${invitation.householdId}`);
  await expect(
    page.getByRole("button", { name: "Switch household, Book club" })
  ).toBeVisible();
});

test("names the invited address to someone signed in with another", async ({
  page,
}) => {
  await page.goto(`/invitations/${invitationTo("ewa@example.com").id}`);

  await expect(
    page.getByRole("heading", {
      name: "This invitation is for another address",
    })
  ).toBeVisible();
  await expect(page.getByText("e•••@example.com")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("invites someone from the household settings", async ({ page }) => {
  await page.goto(
    `/households/${householdNamed("Flat on Piękna").id}/settings`
  );

  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByLabel("Email").fill("zofia@example.com");
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Send invitation" }).click();

  await expect(
    page.getByRole("listitem").filter({ hasText: "zofia@example.com" })
  ).toBeVisible();
});
