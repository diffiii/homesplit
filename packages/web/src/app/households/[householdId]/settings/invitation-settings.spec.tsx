import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { queryKeys } from "@/lib/api/query-keys";
import { formatLocalDate } from "@/lib/dates";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
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

/** Makes the user with `email` Alice's friend. */
const befriend = (email: string) => {
  const alice = db.userByEmail("alice@example.com");
  const friend = db.userByEmail(email);
  if (!(alice && friend)) {
    throw new Error(`The scenario has no user ${email}`);
  }
  db.state.friendships.push({
    id: crypto.randomUUID(),
    userIds: [alice.id, friend.id],
    createdAt: new Date().toISOString(),
  });
};

const DAWID = "dawid@example.com";
const FILIP = "filip@example.com";
const NO_MATCH = /^No friends match/u;
const DAWID_BOX = /Dawid/u;
const FILIP_BOX = /Filip/u;

async function openInvite(user: ReturnType<typeof renderSettings>["user"]) {
  await user.click(
    within(await section()).getByRole("button", { name: "Invite" })
  );
  return screen.findByRole("dialog", { name: "Invite someone" });
}

const friendOptions = async (dialog: HTMLElement) =>
  within(await within(dialog).findByRole("group", { name: "Friends" }))
    .getAllByRole("checkbox")
    .map((box) => box.closest("li")?.textContent);

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

  describe("friend picker", () => {
    it("lists friends who aren't members or invited, searchable by name or email", async () => {
      befriend(DAWID);
      befriend(FILIP);
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      // Bartek is a member and Ewa has an invitation; Dawid left.
      expect(await friendOptions(dialog)).toEqual([
        expect.stringContaining(DAWID),
        expect.stringContaining(FILIP),
      ]);
      await expectNoAxeViolations(document.body, {
        rules: { "landmark-unique": { enabled: false } },
      });

      const search = within(dialog).getByLabelText("Search friends");
      // Enter only searches, even with a friend picked.
      await user.click(
        within(dialog).getByRole("checkbox", { name: DAWID_BOX })
      );
      await user.type(search, "fil{Enter}");
      expect(await friendOptions(dialog)).toEqual([
        expect.stringContaining("Filip Wójcik"),
      ]);
      expect(dialog).toBeVisible();
      expect(invitationsTo(DAWID)).toEqual([]);
      await user.clear(search);
      await user.type(search, "DAWID@");
      expect(await friendOptions(dialog)).toEqual([
        expect.stringContaining("Dawid Lewandowski"),
      ]);
      await user.type(search, "x");
      expect(within(dialog).getByText(NO_MATCH)).toHaveAttribute(
        "aria-live",
        "polite"
      );
    });

    it("offers a friend whose invitation has expired", async () => {
      ewasInvitation().expiresAt = new Date(Date.now() - DAY_MS).toISOString();
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      expect(await friendOptions(dialog)).toEqual([
        expect.stringContaining(EWA),
      ]);
    });

    it("invites several friends and an address with one role", async () => {
      befriend(DAWID);
      befriend(FILIP);
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      // A search hides a picked friend without unpicking them.
      await user.click(
        await within(dialog).findByRole("checkbox", { name: DAWID_BOX })
      );
      await user.type(within(dialog).getByLabelText("Search friends"), "fil");
      await user.click(
        within(dialog).getByRole("checkbox", { name: FILIP_BOX })
      );
      await user.type(within(dialog).getByLabelText("Email"), NEW_ADDRESS);
      await user.click(within(dialog).getByRole("combobox", { name: "Role" }));
      await user.click(await screen.findByRole("option", { name: "Admin" }));
      await user.click(
        within(dialog).getByRole("button", { name: "Send invitation" })
      );

      expect(
        await screen.findByText(
          `Invitations sent to Dawid Lewandowski, Filip Wójcik, and ${NEW_ADDRESS}.`
        )
      ).toBeVisible();
      for (const email of [DAWID, FILIP, NEW_ADDRESS]) {
        expect(invitationsTo(email)).toMatchObject([
          { role: "admin", status: "pending" },
        ]);
      }
    });

    it("shows each invitation's outcome when some fail", async () => {
      befriend(DAWID);
      befriend(FILIP);
      server.use(
        http.post(
          "*/api/auth/organization/invite-member",
          async ({ request }) => {
            const { email } = (await request.clone().json()) as {
              email: string;
            };
            if (email === FILIP) {
              return HttpResponse.json(
                { code: "INVITATION_LIMIT_REACHED", message: "Limit" },
                { status: 403 }
              );
            }
          }
        )
      );
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      await user.click(
        await within(dialog).findByRole("checkbox", { name: DAWID_BOX })
      );
      await user.click(
        within(dialog).getByRole("checkbox", { name: FILIP_BOX })
      );
      // Typing a picked friend's address sends one invitation, not two.
      await user.type(within(dialog).getByLabelText("Email"), DAWID);
      await user.click(
        within(dialog).getByRole("button", { name: "Send invitation" })
      );

      const outcomes = await within(dialog).findByRole("alert");
      expect(outcomes).toHaveTextContent("Sent to Dawid Lewandowski.");
      expect(outcomes).toHaveTextContent(
        "Not sent to Filip Wójcik: The household has too many pending invitations. Cancel some first."
      );
      await waitFor(async () =>
        expect(await friendOptions(dialog)).toEqual([
          expect.stringContaining(FILIP),
        ])
      );
      expect(
        within(dialog).getByRole("checkbox", { name: FILIP_BOX })
      ).toBeChecked();
      expect(invitationsTo(DAWID)).toHaveLength(1);
      expect(within(dialog).getByLabelText("Email")).toHaveValue("");
      expect(invitationsTo(FILIP)).toEqual([]);
    });

    it("stops offering an invited friend when the refetch fails", async () => {
      befriend(DAWID);
      befriend(FILIP);
      server.use(
        http.post(
          "*/api/auth/organization/invite-member",
          async ({ request }) => {
            const { email } = (await request.clone().json()) as {
              email: string;
            };
            if (email === FILIP) {
              return HttpResponse.json(
                { code: "INVITATION_LIMIT_REACHED", message: "Limit" },
                { status: 403 }
              );
            }
            // Dawid's goes through, and then the household can't be loaded.
            server.use(
              http.get("*/api/auth/organization/get-full-organization", () =>
                HttpResponse.json(
                  { code: "INTERNAL_ERROR", message: "Boom" },
                  { status: 500 }
                )
              )
            );
          }
        )
      );
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      await user.click(
        await within(dialog).findByRole("checkbox", { name: DAWID_BOX })
      );
      await user.click(
        within(dialog).getByRole("checkbox", { name: FILIP_BOX })
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Send invitation" })
      );

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Some invitations weren't sent."
      );
      expect(await friendOptions(dialog)).toEqual([
        expect.stringContaining(FILIP),
      ]);
    });

    it("says when every invitation failed", async () => {
      befriend(DAWID);
      server.use(
        http.post("*/api/auth/organization/invite-member", () =>
          HttpResponse.json(
            { code: "INVITATION_LIMIT_REACHED", message: "Limit" },
            { status: 403 }
          )
        )
      );
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      await user.click(
        await within(dialog).findByRole("checkbox", { name: DAWID_BOX })
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Send invitation" })
      );

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "The invitation wasn't sent."
      );
    });

    it("unpicks a friend who joins meanwhile", async () => {
      befriend(DAWID);
      befriend(FILIP);
      const { user, queryClient } = renderSettings();
      const dialog = await openInvite(user);
      await user.click(
        await within(dialog).findByRole("checkbox", { name: DAWID_BOX })
      );

      const dawid = db.userByEmail(DAWID);
      db.addMember({
        id: crypto.randomUUID(),
        householdId: household(FLAT).id,
        userId: dawid?.id ?? "",
        role: "member",
        createdAt: new Date().toISOString(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.household(household(FLAT).id),
      });
      await waitFor(async () =>
        expect(await friendOptions(dialog)).toEqual([
          expect.stringContaining(FILIP),
        ])
      );
      await user.type(within(dialog).getByLabelText("Email"), NEW_ADDRESS);
      await user.click(
        within(dialog).getByRole("button", { name: "Send invitation" })
      );

      expect(
        await screen.findByText(`Invitation sent to ${NEW_ADDRESS}.`)
      ).toBeVisible();
      expect(invitationsTo(DAWID)).toEqual([]);
    });

    it("asks for a friend or an address", async () => {
      befriend(DAWID);
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      await within(dialog).findByRole("group", { name: "Friends" });
      await user.click(
        within(dialog).getByRole("button", { name: "Send invitation" })
      );

      expect(
        await within(dialog).findByText(
          "Pick a friend or enter an email address."
        )
      ).toBeVisible();
      await user.click(
        within(dialog).getByRole("checkbox", { name: DAWID_BOX })
      );
      await waitFor(() =>
        expect(
          within(dialog).queryByText("Pick a friend or enter an email address.")
        ).not.toBeInTheDocument()
      );
      expect(within(dialog).getByLabelText("Email")).not.toHaveAttribute(
        "aria-invalid",
        "true"
      );
    });

    it("keeps listing friends when only a refetch fails", async () => {
      befriend(DAWID);
      const { user, queryClient } = renderSettings();
      const dialog = await openInvite(user);
      await within(dialog).findByRole("group", { name: "Friends" });

      server.use(
        http.get("*/api/me/friends", () =>
          HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Boom" },
            { status: 500 }
          )
        )
      );
      await queryClient.refetchQueries({
        queryKey: queryKeys.endpoint("listFriendships"),
      });

      expect(
        within(dialog).getByRole("group", { name: "Friends" })
      ).toBeVisible();
      expect(
        within(dialog).queryByText(
          "Couldn't load your friends. You can still invite by email."
        )
      ).not.toBeInTheDocument();
    });

    it("still invites by email when friends fail to load", async () => {
      server.use(
        http.get("*/api/me/friends", () =>
          HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Boom" },
            { status: 500 }
          )
        )
      );
      const { user } = renderSettings();
      const dialog = await openInvite(user);

      expect(
        await within(dialog).findByText(
          "Couldn't load your friends. You can still invite by email."
        )
      ).toBeVisible();
      expect(within(dialog).getByLabelText("Email")).toBeVisible();
    });
  });
});
