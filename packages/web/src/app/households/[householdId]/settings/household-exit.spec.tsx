import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { householdQueries } from "@/lib/api/household-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { HOUSEHOLDS_PATH } from "@/lib/last-household";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import SettingsPage from "./page";

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

/** Nobody in the household owes anybody anything anymore. */
function settle(name: string) {
  const { id } = household(name);
  db.state.expenses = db.state.expenses.filter(
    (expense) => expense.householdId !== id
  );
  db.state.settlements = db.state.settlements.filter(
    (settlement) => settlement.householdId !== id
  );
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

const leaveButton = () =>
  screen.findByRole("button", { name: "Leave household" });
const deleteButton = () =>
  screen.findByRole("button", { name: "Delete household" });

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("LeaveHousehold", () => {
  it("asks first, then leaves for another household and forgets this one", async () => {
    settle("Lake cabin");
    const cabin = household("Lake cabin");
    const flat = household("Flat on Piękna");
    const { user, queryClient, unmount } = renderSettings(cabin.id);

    await user.click(await leaveButton());
    const dialog = await screen.findByRole("alertdialog", {
      name: "Leave this household?",
    });
    expect(memberOf("Lake cabin", "alice@example.com")).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Leave" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/households/${flat.id}`)
    );
    expect(memberOf("Lake cabin", "alice@example.com")).toBeUndefined();
    expect(
      queryClient
        .getQueryData(householdQueries.list().queryKey)
        ?.map(({ name }) => name)
    ).toEqual(["Flat on Piękna"]);
    // Still on the page, the shell keeps what it has rather than finding a 404.
    expect(screen.queryByText("Household not found")).not.toBeInTheDocument();

    unmount();
    expect(
      queryClient.getQueriesData({ queryKey: queryKeys.household(cabin.id) })
    ).toEqual([]);
  });

  it("explains an unsettled balance and links to settling up", async () => {
    const cabin = household("Lake cabin");
    const { user } = renderSettings(cabin.id);

    await user.click(await leaveButton());
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Leave" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("you owe or are owed money");
    expect(
      within(alert).getByRole("link", { name: "Go to balances" })
    ).toHaveAttribute("href", `/households/${cabin.id}/expenses/balances`);
    expect(memberOf("Lake cabin", "alice@example.com")).toBeDefined();
    expect(router.replace).not.toHaveBeenCalled();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("disables leaving for the last owner and says what to do instead", async () => {
    renderSettings(household("Flat on Piękna").id);

    const button = await leaveButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      expect.stringContaining("Make someone else an owner")
    );
  });

  it("lets an owner leave once there's another owner", async () => {
    const bartek = memberOf("Flat on Piękna", "bartek@example.com");
    if (!bartek) {
      throw new Error("The scenario has no Bartek in the flat");
    }
    bartek.role = "owner";
    renderSettings(household("Flat on Piękna").id);

    expect(await leaveButton()).toBeEnabled();
  });
});

describe("DeleteHousehold", () => {
  it("isn't offered to anyone but owners", async () => {
    renderSettings(household("Lake cabin").id);

    await leaveButton();
    expect(
      screen.queryByRole("button", { name: "Delete household" })
    ).not.toBeInTheDocument();
  });

  it("needs the household's exact name, and forgets it when cancelled", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderSettings(flat.id);

    await user.click(await deleteButton());
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete “Flat on Piękna”?",
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Delete household",
    });
    const input = within(dialog).getByLabelText(
      "Type “Flat on Piękna” to confirm"
    );
    expect(confirm).toBeDisabled();
    await user.type(input, "flat on piękna");
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, " Flat on Piękna ");
    expect(confirm).toBeEnabled();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(await deleteButton());
    expect(
      within(await screen.findByRole("alertdialog")).getByLabelText(
        "Type “Flat on Piękna” to confirm"
      )
    ).toHaveValue("");
  });

  it("explains unsettled balances and links to them", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderSettings(flat.id);

    await user.click(await deleteButton());
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Flat on Piękna");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete household" })
    );

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("balances must be zero");
    expect(
      within(alert).getByRole("link", { name: "Go to balances" })
    ).toHaveAttribute("href", `/households/${flat.id}/expenses/balances`);
    expect(household("Flat on Piękna")).toBeDefined();
  });

  it("deletes, then goes to the first-run screen when no household is left", async () => {
    settle("Flat on Piękna");
    const flat = household("Flat on Piękna");
    const cabinMember = memberOf("Lake cabin", "alice@example.com");
    db.state.members = db.state.members.filter(
      (member) => member !== cabinMember
    );
    const { user, queryClient } = renderSettings(flat.id);

    await user.click(await deleteButton());
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Flat on Piękna");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete household" })
    );

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(HOUSEHOLDS_PATH)
    );
    expect(db.state.households.some(({ id }) => id === flat.id)).toBe(false);
    expect(queryClient.getQueryData(householdQueries.list().queryKey)).toEqual(
      []
    );
  });
});
