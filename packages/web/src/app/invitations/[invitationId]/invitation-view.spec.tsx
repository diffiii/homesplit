import { randomUUID } from "node:crypto";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { householdPath } from "@/components/shell/household-nav";
import { queryKeys } from "@/lib/api/query-keys";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import { InvitationView } from "./invitation-view";

const DAY_MS = 86_400_000;

/** Alice's invitation to Filip's book club, or Ewa's to the flat. */
const invitationTo = (email: string) => {
  const invitation = db.state.invitations.find(
    (candidate) => candidate.email === email
  );
  if (!invitation) {
    throw new Error(`The scenario has no invitation for ${email}`);
  }
  return invitation;
};

const alices = () => invitationTo("alice@example.com");

function renderInvitation(invitationId: string) {
  return renderWithProviders(<InvitationView invitationId={invitationId} />, {
    url: `/invitations/${invitationId}`,
    params: { invitationId },
  });
}

describe("InvitationView", () => {
  it("shows the household and the inviter, and joins", async () => {
    const invitation = alices();
    const { user, queryClient } = renderInvitation(invitation.id);

    expect(
      await screen.findByRole("heading", { name: "Join Book club" })
    ).toBeVisible();
    expect(
      screen.getByText("Filip Wójcik invited you to join as a member.", {
        exact: false,
      })
    ).toBeVisible();
    await expectNoAxeViolations();

    await user.click(screen.getByRole("button", { name: "Join household" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        householdPath(invitation.householdId)
      )
    );
    expect(invitation.status).toBe("accepted");
    // Coming back to the page shows it accepted, not "Join household" again.
    expect(
      queryClient.getQueryData(queryKeys.invitation(invitation.id))
    ).toMatchObject({ status: "accepted" });
    expect(
      db.state.members.some(
        (member) =>
          member.householdId === invitation.householdId &&
          member.userId === db.userByEmail("alice@example.com")?.id
      )
    ).toBe(true);
  });

  it("declines after asking", async () => {
    const invitation = alices();
    const { user } = renderInvitation(invitation.id);

    await user.click(await screen.findByRole("button", { name: "Decline" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Decline the invitation?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Decline" }));

    expect(
      await screen.findByRole("heading", {
        name: "This invitation was declined",
      })
    ).toBeVisible();
    expect(invitation.status).toBe("rejected");
  });

  it("shows what changed when the invitation was cancelled meanwhile", async () => {
    const invitation = alices();
    const { user } = renderInvitation(invitation.id);
    await screen.findByRole("heading", { name: "Join Book club" });

    invitation.status = "canceled";
    await user.click(screen.getByRole("button", { name: "Join household" }));

    expect(
      await screen.findByRole("heading", {
        name: "This invitation was cancelled",
      })
    ).toBeVisible();
  });

  it("tells a user signed in with another address which one it's for", async () => {
    renderInvitation(invitationTo("ewa@example.com").id);

    expect(
      await screen.findByRole("heading", {
        name: "This invitation is for another address",
      })
    ).toBeVisible();
    // The API masks the address for anyone but the invitee.
    expect(screen.getByText("e•••@example.com")).toBeVisible();
    expect(screen.queryByText("ewa@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Switch account" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Join household" })
    ).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it.each(["canceled", "accepted"] as const)(
    "tells anyone else only which account to use once it's %s",
    async (status) => {
      const invitation = invitationTo("ewa@example.com");
      invitation.status = status;
      renderInvitation(invitation.id);

      expect(
        await screen.findByRole("heading", {
          name: "This invitation is for another address",
        })
      ).toBeVisible();
      expect(
        screen.getByText("It was sent to", { exact: false })
      ).toHaveTextContent("e•••@example.com");
      expect(screen.queryByText("Flat on Piękna", { exact: false })).toBeNull();
    }
  );

  it.each([
    ["canceled", "This invitation was cancelled"],
    ["rejected", "This invitation was declined"],
    ["accepted", "This invitation has been accepted"],
  ] as const)("explains a %s invitation", async (status, title) => {
    const invitation = alices();
    invitation.status = status;
    renderInvitation(invitation.id);

    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Join household" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your households" })).toBeVisible();
  });

  it("explains an expired invitation", async () => {
    const invitation = alices();
    invitation.expiresAt = new Date(Date.now() - DAY_MS).toISOString();
    renderInvitation(invitation.id);

    expect(
      await screen.findByRole("heading", {
        name: "This invitation has expired",
      })
    ).toBeVisible();
    expect(
      screen.getByText("Ask Filip Wójcik to send it again.", {
        exact: false,
      })
    ).toBeVisible();
  });

  it("links an accepted invitation to its household", async () => {
    const invitation = alices();
    invitation.status = "accepted";
    renderInvitation(invitation.id);

    expect(
      await screen.findByRole("link", { name: "Open Book club" })
    ).toHaveAttribute("href", householdPath(invitation.householdId));
  });

  it("says so when the invitation doesn't exist", async () => {
    renderInvitation(randomUUID());

    expect(
      await screen.findByRole("heading", { name: "Invitation not found" })
    ).toBeVisible();
  });
});
