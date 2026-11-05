import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
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

const sidebarItem = (label: string) => {
  const [sidebar] = screen.getAllByRole("navigation", { name: "Household" });
  return within(sidebar).getByRole("link", { name: label }).closest("li");
};

describe("ModuleSettings", () => {
  it("lets an owner turn a module off, and the shell follows at once", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderSettings(flat.id);

    const shopping = await screen.findByRole("switch", { name: "Shopping" });
    expect(shopping).toBeChecked();
    expect(shopping).toHaveAccessibleDescription(
      expect.stringContaining("read-only and deletes nothing")
    );
    expect(sidebarItem("Shopping")).not.toHaveTextContent("Off");

    await user.click(shopping);

    expect(
      await screen.findByRole("switch", { name: "Shopping", checked: false })
    ).toBeEnabled();
    expect(sidebarItem("Shopping")).toHaveTextContent("Off");
    expect(household("Flat on Piękna").features.shopping).toBe(false);
    // jsdom sees both navs labelled "Household"; a browser shows one per screen size.
    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
  });

  it("explains why expenses stay on while balances are unsettled", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderSettings(flat.id);

    await user.click(await screen.findByRole("switch", { name: "Expenses" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("anyone owes or is owed money");
    expect(
      within(alert).getByRole("link", { name: "Settle the balances first" })
    ).toHaveAttribute("href", `/households/${flat.id}/expenses`);
    expect(screen.getByRole("switch", { name: "Expenses" })).toBeChecked();
    expect(household("Flat on Piękna").features.expenses).toBe(true);
  });

  it("lets an owner opt in to AI after reading what it sends", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderSettings(flat.id);

    const ai = await screen.findByRole("switch", { name: "AI" });
    expect(ai).not.toBeChecked();
    expect(ai).toHaveAccessibleDescription(
      expect.stringContaining("sent to an AI provider")
    );

    await user.click(ai);

    expect(
      await screen.findByRole("switch", { name: "AI", checked: true })
    ).toBeEnabled();
    expect(household("Flat on Piękna").features.ai).toBe(true);
  });

  it("shows members which modules are on without letting them change it", async () => {
    // Alice is a plain member of the cabin, which has chores turned off.
    renderSettings(household("Lake cabin").id);

    expect(
      await screen.findByText("Only admins and owners can change it", {
        exact: false,
      })
    ).toBeVisible();
    const switches = screen.getAllByRole("switch");
    expect(
      switches.map((control) => control.getAttribute("aria-checked"))
    ).toEqual(["true", "false", "true", "false"]);
    for (const control of switches) {
      expect(control).toHaveAttribute("aria-disabled", "true");
    }
  });
});
