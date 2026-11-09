import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { formatLocalDate } from "@/lib/dates";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import SettingsPage from "./page";

const FLAT = "Flat on Piękna";
const EWA = "ewa@example.com";
const NEW_ADDRESS = "zofia@example.com";
const DAY_MS = 86_400_000;

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

const invitationsTo = (email: string) =>
  db.state.invitations.filter(
    (invitation) =>
      invitation.householdId === household(FLAT).id &&
      invitation.email === email
  );

const ewasInvitation = () => {
  const [invitation] = invitationsTo(EWA);
  if (!invitation) {
    throw new Error("The scenario has no invitation for Ewa");
  }
  return invitation;
};

function renderSettings(name = FLAT) {
  const householdId = household(name).id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <SettingsPage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/settings`,
      params: { householdId },
    }
  );
}

const section = async () =>
  (await screen.findByRole("heading", { name: "Invitations" })).closest(
    "section"
  ) as HTMLElement;

const row = async (email: string) =>
  (await within(await section()).findByText(email)).closest(
    "li"
  ) as HTMLElement;

async function openMenu(
  user: ReturnType<typeof renderSettings>["user"],
  email: string
) {
  await user.click(
    within(await row(email)).getByRole("button", {
      name: `Manage invitation for ${email}`,
    })
  );
}

describe("InvitationSettings", () => {
  it("lists pending invitations with their role and expiry", async () => {
    renderSettings();

    const ewa = await row(EWA);
    expect(ewa).toHaveTextContent("Member");
    expect(ewa).toHaveTextContent(
      `Expires ${formatLocalDate(ewasInvitation().expiresAt)}`
    );

    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
  });

  it("marks an invitation that has expired", async () => {
    const expiresAt = new Date(Date.now() - DAY_MS).toISOString();
    ewasInvitation().expiresAt = expiresAt;
    renderSettings();

    expect(await row(EWA)).toHaveTextContent(
      `Expired ${formatLocalDate(expiresAt)}`
    );
  });

  it("invites an address and lists the invitation", async () => {
    const { user } = renderSettings();

    await user.click(
      within(await section()).getByRole("button", { name: "Invite" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Invite someone",
    });
    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
    await user.type(within(dialog).getByLabelText("Email"), NEW_ADDRESS);
    await user.click(
      within(dialog).getByRole("button", { name: "Send invitation" })
    );

    expect(await row(NEW_ADDRESS)).toHaveTextContent("Member");
    expect(
      await screen.findByText(`Invitation sent to ${NEW_ADDRESS}.`)
    ).toBeVisible();
    expect(invitationsTo(NEW_ADDRESS)).toMatchObject([
      { role: "member", status: "pending" },
    ]);
  });

  it("explains that a member can't be invited", async () => {
    const { user } = renderSettings();

    await user.click(
      within(await section()).getByRole("button", { name: "Invite" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Invite someone",
    });
    await user.type(
      within(dialog).getByLabelText("Email"),
      "bartek@example.com"
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Send invitation" })
    );

    expect(
      await within(dialog).findByText(
        "They're already a member of this household."
      )
    ).toBeVisible();
    expect(invitationsTo("bartek@example.com")).toEqual([]);
  });

  it("sends an invitation again with a later expiry", async () => {
    const before = ewasInvitation().expiresAt;
    const { user } = renderSettings();

    await openMenu(user, EWA);
    await user.click(
      await screen.findByRole("menuitem", { name: "Send again" })
    );

    expect(
      await screen.findByText(`Invitation sent to ${EWA} again.`)
    ).toBeVisible();
    expect(ewasInvitation().status).toBe("pending");
    expect(Date.parse(ewasInvitation().expiresAt)).toBeGreaterThan(
      Date.parse(before)
    );
  });

  it("cancels an invitation after asking", async () => {
    const { user } = renderSettings();

    await openMenu(user, EWA);
    await user.click(
      await screen.findByRole("menuitem", { name: "Cancel invitation" })
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: `Cancel the invitation to ${EWA}?`,
    });
    await user.click(
      within(confirm).getByRole("button", { name: "Cancel invitation" })
    );

    await waitFor(async () =>
      expect(within(await section()).queryByText(EWA)).not.toBeInTheDocument()
    );
    expect(
      within(await section()).getByText("No pending invitations.")
    ).toBeVisible();
    expect(ewasInvitation().status).toBe("canceled");
  });

  it("isn't shown to members", async () => {
    // Alice is a plain member of the cabin.
    renderSettings("Lake cabin");

    expect(
      await screen.findByRole("heading", { name: "Members" })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Invitations" })
    ).not.toBeInTheDocument();
  });
});
