import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import ExpensePage from "./page";

const flat = () => {
  const found = db.state.households.find(
    (candidate) => candidate.name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no flat");
  }
  return found;
};

const expenseId = (name: string) => {
  const found = db.state.expenses.find((expense) => expense.name === name);
  if (!found) {
    throw new Error(`The scenario has no expense ${name}`);
  }
  return found.id;
};

function renderExpense(id: string) {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ExpensePage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/${id}`,
      params: { householdId, expenseId: id },
    }
  );
}

/** A row's text as read aloud: avatars hidden, whitespace collapsed. */
function spokenText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const avatar of copy.querySelectorAll('[data-slot="avatar"]')) {
    avatar.remove();
  }
  return (copy.textContent ?? "").replace(/\s+/gu, " ");
}

const rowsOf = (name: string) =>
  within(screen.getByRole("region", { name }))
    .getAllByRole(name === "Split" ? "row" : "listitem")
    .map(spokenText);

describe("ExpensePage", () => {
  it("shows payers, the split with its inputs, and the details", async () => {
    renderExpense(expenseId("Pizza night"));

    expect(
      await screen.findByRole("heading", { name: "Pizza night" })
    ).toBeVisible();
    expect(screen.getByText("PLN 129.00")).toBeVisible();
    expect(screen.getByText("Dining out")).toBeVisible();
    expect(screen.getByText("Added by").nextElementSibling).toHaveTextContent(
      "Celina Wiśniewska"
    );
    expect(rowsOf("Paid by")).toEqual([
      "Alice NowakPLN 39.00",
      "Celina WiśniewskaPLN 90.00",
    ]);
    expect(screen.getByText("Exact amounts")).toBeVisible();
    expect(rowsOf("Split")).toEqual([
      "PersonInputShare",
      "Alice NowakPLN 39.00PLN 39.00",
      "Bartek KowalskiPLN 45.00PLN 45.00",
      "Celina WiśniewskaPLN 45.00PLN 45.00",
    ]);
    expect(screen.getByRole("link", { name: "All expenses" })).toHaveAttribute(
      "href",
      `/households/${flat().id}/expenses`
    );
    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
  });

  it("shows the description and the inputs of a shares split", async () => {
    renderExpense(expenseId("Electricity"));

    expect(await screen.findByText("September and October")).toBeVisible();
    expect(screen.getByText("By shares")).toBeVisible();
    expect(rowsOf("Split")).toEqual([
      "PersonInputShare",
      "Alice Nowak2 sharesPLN 156.25",
      "Bartek Kowalski1 sharePLN 78.13",
      "Celina Wiśniewska1 sharePLN 78.12",
    ]);
  });

  it("marks people who left the household", async () => {
    renderExpense(expenseId("Internet"));

    expect(
      await screen.findByRole("heading", { name: "Internet" })
    ).toBeVisible();
    expect(screen.getByText("Split equally")).toBeVisible();
    expect(screen.getByText("Added by").nextElementSibling).toHaveTextContent(
      "Dawid LewandowskiLeft the household"
    );
    expect(rowsOf("Split")).toContain(
      "Dawid LewandowskiLeft the householdPLN 22.49"
    );
  });

  it("says when the expense doesn't exist", async () => {
    renderExpense(crypto.randomUUID());

    expect(await screen.findByText("Expense not found")).toBeVisible();
    // The household is still there; only the expense is missing.
    expect(
      screen.queryByRole("heading", { name: "Household not found" })
    ).not.toBeInTheDocument();
  });
});
