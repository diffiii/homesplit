import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import ExpensesPage from "./page";

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

const categoryId = (householdId: string, name: string) =>
  db.state.categories.find(
    (category) => category.householdId === householdId && category.name === name
  )?.id;

function renderExpenses(householdId: string, search = "") {
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ExpensesPage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses${search && `?${search}`}`,
      params: { householdId },
    }
  );
}

const row = (name: string) =>
  screen.getByRole("link", { name: new RegExp(`^${name}`) });

const DAWID = /Dawid Lewandowski/;

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("ExpensesPage", () => {
  it("lists expenses by date with the payer and what each means for the user", async () => {
    const flat = household("Flat on Piękna");
    renderExpenses(flat.id);

    expect(await screen.findByText("Showing 20 of 26 expenses")).toBeVisible();
    const yesterday = screen.getByRole("region", { name: "Yesterday" });
    expect(
      within(yesterday)
        .getAllByRole("link")
        .map((link) => link.querySelector(".font-medium")?.textContent)
    ).toEqual(expect.arrayContaining(["Ferry tickets", "Cleaning supplies"]));

    // Alice paid the whole ferry and her share is half of it, in euros.
    expect(row("Ferry tickets")).toHaveTextContent(
      "Transport · Paid by Alice Nowak"
    );
    expect(row("Ferry tickets")).toHaveTextContent("EUR 180.00");
    expect(row("Ferry tickets")).toHaveTextContent("You lent EUR 90.00");
    // Celina and Alice paid for pizza; Alice paid exactly her share.
    expect(row("Pizza night")).toHaveTextContent(
      "Paid by Alice Nowak and Celina Wiśniewska"
    );
    expect(row("Pizza night")).toHaveTextContent("Settled");
    expect(row("Electricity")).toHaveTextContent("You owe PLN 156.25");
    expect(row("Pizza night")).toHaveAttribute(
      "href",
      expect.stringMatching(
        new RegExp(`^/households/${flat.id}/expenses/[0-9a-f-]+$`)
      )
    );
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("loads the next page", async () => {
    const { user } = renderExpenses(household("Flat on Piękna").id);

    await user.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Showing 26 of 26 expenses")).toBeVisible();
    expect(row("Rent, August")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();
  });

  it("shows the filters from the URL and clears them at once", async () => {
    const flat = household("Flat on Piękna");
    const utilities = categoryId(flat.id, "Utilities");
    const { user } = renderExpenses(flat.id, `category=${utilities}`);

    expect(await screen.findByText("Showing 2 of 2 expenses")).toBeVisible();
    expect(row("Electricity")).toBeVisible();
    expect(row("Internet")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Category" })
    ).toHaveTextContent("Utilities");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(router.replace).toHaveBeenCalledWith(
      `/households/${flat.id}/expenses`,
      { scroll: false }
    );
  });

  it("keeps a picked filter in the URL", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderExpenses(flat.id, "from=2026-01-01");

    await user.click(await screen.findByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));

    expect(router.replace).toHaveBeenCalledWith(
      `/households/${flat.id}/expenses?category=${categoryId(flat.id, "Groceries")}&from=2026-01-01`,
      { scroll: false }
    );
  });

  it("offers departed people with a balance in the person filter", async () => {
    const { user } = renderExpenses(household("Flat on Piękna").id);

    await user.click(await screen.findByRole("combobox", { name: "Person" }));

    const dawid = await screen.findByRole("option", {
      name: DAWID,
    });
    expect(dawid).toHaveTextContent("Left the household");
    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual([
      "Everyone",
      expect.stringContaining("Alice Nowak"),
      expect.stringContaining("Bartek Kowalski"),
      expect.stringContaining("Celina Wiśniewska"),
      expect.stringContaining("Dawid Lewandowski"),
    ]);
  });

  it("says when nothing matches the filters", async () => {
    const flat = household("Flat on Piękna");
    renderExpenses(flat.id, `category=${categoryId(flat.id, "Entertainment")}`);

    expect(await screen.findByText("No expenses match")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Clear filters" })
    ).toHaveLength(2);
  });

  it("shows an empty list before the first expense", async () => {
    const flat = household("Flat on Piękna");
    db.state.expenses = db.state.expenses.filter(
      (expense) => expense.householdId !== flat.id
    );
    renderExpenses(flat.id);

    expect(await screen.findByText("No expenses yet")).toBeVisible();
  });
});
