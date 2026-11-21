import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import HouseholdOverviewPage from "./page";

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

function renderOverview(householdId: string) {
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <HouseholdOverviewPage />
    </HouseholdShell>,
    { url: `/households/${householdId}`, params: { householdId } }
  );
}

const card = (name: string) => screen.findByRole("region", { name });

const WAITING = /^Celina Wiśniewska paid you PLN\s200\.00/u;
const OWED_EUR = /^You're owed EUR\s90\.00$/u;
// The shell renders its navigation twice, for the sidebar and the phone bar.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("HouseholdOverviewPage", () => {
  it("shows the waiting payment, my balances, what's left to buy, and the latest expenses", async () => {
    const { id } = household("Flat on Piękna");
    renderOverview(id);

    const money = within(await card("Money"));
    expect(await money.findByText(OWED_EUR)).toBeVisible();
    expect(await money.findByRole("link", { name: WAITING })).toHaveAttribute(
      "href",
      `/households/${id}/expenses/balances`
    );
    expect(money.getByRole("link", { name: "Settle up" })).toBeVisible();

    const shopping = within(await card("Shopping"));
    expect(await shopping.findByText("3")).toBeVisible();
    expect(shopping.getByText("items to buy")).toBeVisible();

    const expenses = within(await card("Recent expenses"));
    expect(await expenses.findByText("Ferry tickets")).toBeVisible();
    expect(expenses.getByText("Cleaning supplies")).toBeVisible();
    expect(expenses.getByText("Pizza night")).toBeVisible();
    expect(expenses.queryByText("Electricity")).not.toBeInTheDocument();

    const chores = within(await card("Your chores"));
    expect(await chores.findByText("Clean the bathroom")).toBeVisible();
    expect(
      chores.getByRole("link", { name: "All your chores (1)" })
    ).toHaveAttribute("href", `/households/${id}/chores?view=mine`);
    await expectNoAxeViolations(undefined, AXE_OPTIONS);
  });

  it("marks my overdue chores and leaves out the others' chores", async () => {
    const flat = household("Flat on Piękna");
    const mine = db.state.chores.find(
      (chore) => chore.name === "Clean the bathroom"
    );
    if (!mine) {
      throw new Error("The scenario has no Clean the bathroom");
    }
    mine.dueAt = new Date(Date.now() - 60_000).toISOString();
    renderOverview(flat.id);

    const chores = within(await card("Your chores"));
    expect(await chores.findByText("Clean the bathroom")).toBeVisible();
    expect(chores.getByText("Overdue:", { exact: false })).toBeInTheDocument();
    expect(chores.queryByText("Take out the bins")).not.toBeInTheDocument();
  });

  it("hides the card of a module that's off", async () => {
    renderOverview(household("Lake cabin").id);

    await card("Money");
    expect(
      screen.queryByRole("region", { name: "Your chores" })
    ).not.toBeInTheDocument();
  });

  it("points an admin to the settings when every module is off", async () => {
    const flat = household("Flat on Piękna");
    flat.features = {
      ...flat.features,
      expenses: false,
      chores: false,
      shopping: false,
    };
    renderOverview(flat.id);

    expect(await screen.findByText("No modules are turned on")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute(
      "href",
      `/households/${flat.id}/settings`
    );
  });
});
