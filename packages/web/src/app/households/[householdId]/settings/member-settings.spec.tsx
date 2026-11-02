import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { ApiRequestError } from "@/lib/api/api-error";
import { formatLocalDate } from "@/lib/dates";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { describeMemberError } from "./member-settings";
import SettingsPage from "./page";

const MANAGE = /^Manage/u;
const REMOVE = /Remove/u;

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

const memberOf = (householdName: string, email: string) => {
  const user = db.userByEmail(email);
  return db.state.members.find(
    (member) =>
      member.householdId === household(householdName).id &&
      member.userId === user?.id
  );
};

const roleIn = (householdName: string, email: string) =>
  memberOf(householdName, email)?.role;

/**
 * Make Alice an admin of the flat, under Bartek as its owner. She stays
 * signed in: Better Auth's client keeps the session between tests.
 */
function makeAliceAnAdmin() {
  const alice = memberOf("Flat on Piękna", "alice@example.com");
  const bartek = memberOf("Flat on Piękna", "bartek@example.com");
  if (!(alice && bartek)) {
    throw new Error("The scenario has no Alice or Bartek in the flat");
  }
  alice.role = "admin";
  bartek.role = "owner";
}

function renderSettings(householdId: string) {
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

const memberList = async () =>
  within(
    (await screen.findByRole("heading", { name: "Members" })).closest(
      "section"
    ) as HTMLElement
  ).getByRole("list");

const row = async (name: string) =>
  (await within(await memberList()).findByText(name, { exact: true })).closest(
    "li"
  ) as HTMLElement;

describe("MemberSettings", () => {
  it("lists current members with their email, role, and join date", async () => {
    renderSettings(household("Flat on Piękna").id);

    const items = within(await memberList()).getAllByRole("listitem");
    expect(
      items.map((item) => item.querySelector(".font-medium")?.textContent)
    ).toEqual(["Alice Nowak", "Bartek Kowalski", "Celina Wiśniewska"]);

    const alice = await row("Alice Nowak");
    expect(alice).toHaveTextContent("alice@example.com");
    expect(alice).toHaveTextContent("Owner");
    expect(alice).toHaveTextContent("You");
    const joined = db.state.members.find(
      (member) =>
        member.householdId === household("Flat on Piękna").id &&
        member.role === "owner"
    )?.createdAt as string;
    expect(alice).toHaveTextContent(`Joined ${formatLocalDate(joined)}`);
    // Dawid has left; his history shows him elsewhere, but he's no member.
    expect(screen.queryByText("Dawid Lewandowski")).not.toBeInTheDocument();
    // The last owner can't be demoted, and nobody removes themselves.
    expect(
      within(alice).queryByRole("button", { name: MANAGE })
    ).not.toBeInTheDocument();

    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
  });

  it("lets an owner promote a member at once", async () => {
    const { user } = renderSettings(household("Flat on Piękna").id);

    await user.click(
      within(await row("Celina Wiśniewska")).getByRole("button", {
        name: "Manage Celina Wiśniewska",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make an admin" })
    );

    await waitFor(async () =>
      expect(await row("Celina Wiśniewska")).toHaveTextContent("Admin")
    );
    expect(roleIn("Flat on Piękna", "celina@example.com")).toBe("admin");
  });

  it("asks before making someone an owner and before demoting yourself", async () => {
    const { user } = renderSettings(household("Flat on Piękna").id);

    await user.click(
      within(await row("Bartek Kowalski")).getByRole("button", {
        name: "Manage Bartek Kowalski",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make an owner" })
    );
    const promote = await screen.findByRole("alertdialog", {
      name: "Make Bartek Kowalski an owner?",
    });
    await user.click(
      within(promote).getByRole("button", { name: "Make owner" })
    );
    await waitFor(() =>
      expect(roleIn("Flat on Piękna", "bartek@example.com")).toBe("owner")
    );

    // With a second owner, Alice may step down.
    await user.click(
      await within(await row("Alice Nowak")).findByRole("button", {
        name: "Manage Alice Nowak",
      })
    );
    expect(
      screen.queryByRole("menuitem", { name: REMOVE })
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("menuitem", { name: "Make yourself an admin" })
    );
    const demote = await screen.findByRole("alertdialog", {
      name: "Make yourself an admin?",
    });
    expect(demote).toHaveTextContent("only another owner can give them back");
    await user.click(
      within(demote).getByRole("button", { name: "Make admin" })
    );

    await waitFor(() =>
      expect(roleIn("Flat on Piękna", "alice@example.com")).toBe("admin")
    );
    // As an admin, Alice can no longer touch Bartek, now an owner.
    await waitFor(async () =>
      expect(
        within(await row("Bartek Kowalski")).queryByRole("button", {
          name: MANAGE,
        })
      ).not.toBeInTheDocument()
    );
  });

  it("explains what stays when a member is removed", async () => {
    const { user } = renderSettings(household("Flat on Piękna").id);

    await user.click(
      within(await row("Celina Wiśniewska")).getByRole("button", {
        name: "Manage Celina Wiśniewska",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove from household" })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Celina Wiśniewska?",
    });
    expect(dialog).toHaveTextContent("Everything they added stays");
    expect(dialog).toHaveTextContent("any balance they have here");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(screen.queryByText("Celina Wiśniewska")).not.toBeInTheDocument()
    );
    expect(roleIn("Flat on Piękna", "celina@example.com")).toBeUndefined();
    // Focus doesn't fall to the page with the removed row.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Members" })).toHaveFocus()
    );
  });

  it("offers an admin only what Better Auth allows, and explains a refusal", async () => {
    makeAliceAnAdmin();
    const { user } = renderSettings(household("Flat on Piękna").id);

    // Admins don't act on owners, or make anyone an owner.
    expect(
      within(await row("Bartek Kowalski")).queryByRole("button", {
        name: MANAGE,
      })
    ).not.toBeInTheDocument();
    await user.click(
      within(await row("Celina Wiśniewska")).getByRole("button", {
        name: "Manage Celina Wiśniewska",
      })
    );
    expect(
      screen.queryByRole("menuitem", { name: "Make an owner" })
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove from household" })
    );
    const dialog = await screen.findByRole("alertdialog");

    // Meanwhile, Bartek makes Celina an owner.
    const celina = memberOf("Flat on Piękna", "celina@example.com");
    if (celina) {
      celina.role = "owner";
    }
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Only an owner can remove an owner"
    );
    expect(roleIn("Flat on Piękna", "celina@example.com")).toBe("owner");
  });

  it("keeps focus on the page when an admin demotes themselves", async () => {
    makeAliceAnAdmin();
    const { user } = renderSettings(household("Flat on Piękna").id);

    await user.click(
      within(await row("Alice Nowak")).getByRole("button", {
        name: "Manage Alice Nowak",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make yourself a member" })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Make yourself a member?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Make member" })
    );

    await waitFor(() =>
      expect(roleIn("Flat on Piękna", "alice@example.com")).toBe("member")
    );
    // Her menu is gone, so focus moves to the list instead of the page.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Members" })).toHaveFocus()
    );
    expect(
      screen.queryByRole("button", { name: MANAGE })
    ).not.toBeInTheDocument();
  });

  it("shows a member the list without actions or the name form", async () => {
    // Alice is a plain member of the cabin.
    renderSettings(household("Lake cabin").id);

    expect(await row("Ewa Zielińska")).toHaveTextContent("Owner");
    expect(
      screen.getByText("Only admins and owners can change roles", {
        exact: false,
      })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: MANAGE })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Household name" })
    ).not.toBeInTheDocument();
  });
});

describe("describeMemberError", () => {
  it("explains HomeSplit's self-removal refusal", () => {
    const error = ApiRequestError.fromBody(
      "auth",
      403,
      { code: "CANNOT_REMOVE_SELF", message: "Leave the household instead" },
      "Forbidden"
    );
    expect(describeMemberError(error)).toBe(
      "You can't remove yourself. Leave the household instead, at the bottom of this page."
    );
  });

  it("falls back to the generic message for other codes", () => {
    const error = ApiRequestError.fromBody(
      "auth",
      403,
      { code: "SOMETHING_ELSE", message: "No" },
      "Forbidden"
    );
    expect(describeMemberError(error)).toBe(
      "You don't have permission to do that."
    );
  });
});

describe("HouseholdNameSettings", () => {
  it("renames the household, sending only the name", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderSettings(flat.id);

    const name = await screen.findByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Flat on Piękna");
    await user.clear(name);
    await user.type(name, "  Piękna 12  ");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByText("Household renamed.")).toBeVisible();
    expect(flat.name).toBe("Piękna 12");
    // The switcher follows.
    expect(
      (
        await screen.findAllByRole("button", {
          name: "Switch household, Piękna 12",
        })
      ).length
    ).toBeGreaterThan(0);
  });

  it("asks for a name", async () => {
    const { user } = renderSettings(household("Flat on Piękna").id);

    await user.clear(await screen.findByRole("textbox", { name: "Name" }));
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByText("Give the household a name.")).toBeVisible();
    expect(household("Flat on Piękna").name).toBe("Flat on Piękna");
  });
});
