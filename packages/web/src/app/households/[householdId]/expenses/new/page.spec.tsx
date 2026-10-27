import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { queryKeys } from "@/lib/api/query-keys";
import { todayIsoDate } from "@/lib/dates";
import { rememberExpenseCurrency } from "@/lib/recent-currencies";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import NewExpensePage from "./page";

const flat = () => {
  const found = db.state.households.find(
    (candidate) => candidate.name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no flat");
  }
  return found;
};

const userId = (email: string) => {
  const user = db.userByEmail(email);
  if (!user) {
    throw new Error(`The scenario has no user ${email}`);
  }
  return user.id;
};

function renderForm() {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <NewExpensePage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/new`,
      params: { householdId },
    }
  );
}

const ALICE = "Alice Nowak (you)";
const BARTEK = "Bartek Kowalski";
const CELINA = "Celina Wiśniewska";
const DAWID = /Dawid/;
const BARTEK_ROW = /^Bartek/;

/** A person's checkbox; someone who left also has a badge in its name. */
const person = (name: string) =>
  screen.getByRole("checkbox", {
    name: (accessibleName) => accessibleName.startsWith(name),
  });
/** The share shown on a person's row, or an empty string. */
const shareOf = (name: string) =>
  (
    person(name).closest("li")?.querySelector(".tabular-nums")?.textContent ??
    ""
  ).replace(/\s/g, " ");

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("NewExpensePage", () => {
  it("starts with today, PLN, and every current member", async () => {
    renderForm();

    expect(await screen.findByLabelText("Date")).toHaveValue(todayIsoDate());
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "PLN · Polish Zloty"
    );
    for (const name of [ALICE, BARTEK, CELINA]) {
      expect(person(name)).toBeChecked();
    }
    // Dawid has left, so he isn't offered.
    expect(
      screen.queryByRole("checkbox", { name: DAWID })
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("starts in the currency last used in the household on this device", async () => {
    rememberExpenseCurrency(flat().id, "EUR");
    renderForm();

    expect(
      await screen.findByRole("combobox", { name: "Currency" })
    ).toHaveValue("EUR · Euro");
  });

  it("previews each share as the amount and people change", async () => {
    const { user } = renderForm();

    await user.type(await screen.findByLabelText("Amount"), "100");
    expect([ALICE, BARTEK, CELINA].map(shareOf).sort()).toEqual([
      "PLN 33.33",
      "PLN 33.33",
      "PLN 33.34",
    ]);

    await user.click(person(CELINA));
    expect(shareOf(ALICE)).toBe("PLN 50.00");
    expect(shareOf(BARTEK)).toBe("PLN 50.00");
    expect(shareOf(CELINA)).toBe("");
  });

  it("validates before sending", async () => {
    const { user } = renderForm();
    const before = db.state.expenses.length;

    await user.click(await screen.findByRole("checkbox", { name: ALICE }));
    await user.click(person(BARTEK));
    await user.click(person(CELINA));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(await screen.findByText("Enter a name.")).toBeVisible();
    expect(screen.getByText("Enter an amount.")).toBeVisible();
    expect(
      screen.getByText("Pick at least one person to split it with.")
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(db.state.expenses).toHaveLength(before);
  });

  it("saves, refetches the list and balances, and opens the expense", async () => {
    const householdId = flat().id;
    const { user, queryClient } = renderForm();
    const balances = queryKeys.endpoint("listBalances", {
      params: { householdId },
    });
    queryClient.setQueryData(balances, { items: [] });

    await user.type(await screen.findByLabelText("Name"), "Pizza");
    await user.type(screen.getByLabelText("Amount"), "90");
    await user.click(person(BARTEK));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const expense = db.state.expenses.find(({ name }) => name === "Pizza");
    expect(expense).toMatchObject({
      total: { amountCents: 9000, currency: "PLN" },
      payers: [{ userId: userId("alice@example.com"), amountCents: 9000 }],
      allocation: {
        method: "equal",
        participants: [
          { userId: userId("alice@example.com") },
          { userId: userId("celina@example.com") },
        ],
      },
      expenseDate: todayIsoDate(),
      categoryId: null,
    });
    expect(router.push).toHaveBeenCalledWith(
      `/households/${householdId}/expenses/${expense?.id}`
    );
    expect(queryClient.getQueryState(balances)?.isInvalidated).toBe(true);
  });

  it("names a participant who left meanwhile and saves once they're unchecked", async () => {
    const householdId = flat().id;
    const { user } = renderForm();
    await user.type(await screen.findByLabelText("Name"), "Pizza");
    await user.type(screen.getByLabelText("Amount"), "90");

    const bartek = userId("bartek@example.com");
    db.state.members = db.state.members.filter(
      (member) =>
        !(member.householdId === householdId && member.userId === bartek)
    );
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(
      await screen.findByText(
        "Bartek Kowalski left the household. Uncheck them to save."
      )
    ).toBeVisible();
    // The members refetch, and his row stays so he can be unchecked.
    expect(await screen.findByText("Left the household")).toBeVisible();

    await user.click(person(BARTEK));
    expect(
      screen.queryByRole("checkbox", { name: BARTEK_ROW })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(
      db.state.expenses.find(({ name }) => name === "Pizza")?.allocation
        .participants
    ).toHaveLength(2);
  });

  it("shows the module as off instead of the form", async () => {
    const household = flat();
    household.features = { ...household.features, expenses: false };
    renderForm();

    expect(await screen.findByText("Expenses are turned off")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add expense" })
    ).not.toBeInTheDocument();
  });
});
