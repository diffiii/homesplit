import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { queryKeys } from "@/lib/api/query-keys";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import ExpensePage from "./page";

const householdNamed = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};
const flat = () => householdNamed("Flat on Piękna");

const expenseId = (name: string) => {
  const found = db.state.expenses.find((expense) => expense.name === name);
  if (!found) {
    throw new Error(`The scenario has no expense ${name}`);
  }
  return found.id;
};

function renderExpense(id: string, householdId = flat().id) {
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

  it("offers edit and delete to a member only on their own expenses", async () => {
    // Alice is a plain member of the cabin.
    const cabin = householdNamed("Lake cabin").id;
    const own = renderExpense(expenseId("Firewood"), cabin);
    expect(await screen.findByRole("link", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
    own.unmount();

    renderExpense(expenseId("Cabin rental"), cabin);
    expect(
      await screen.findByRole("heading", { name: "Cabin rental" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  it("offers neither while expenses are turned off", async () => {
    flat().features.expenses = false;
    renderExpense(expenseId("Pizza night"));

    expect(
      await screen.findByRole("heading", { name: "Pizza night" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  it("deletes after confirming, then refetches the list and balances", async () => {
    const id = expenseId("Pizza night");
    const { user, queryClient } = renderExpense(id);
    const params = { params: { householdId: flat().id } };
    const refetched = [
      queryKeys.endpoint("listExpenses", params),
      queryKeys.endpoint("listBalances", params),
    ];
    for (const queryKey of refetched) {
      queryClient.setQueryData(queryKey, {});
    }

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete “Pizza night”?",
    });
    expect(db.state.expenses.some((expense) => expense.id === id)).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        `/households/${flat().id}/expenses`
      )
    );
    expect(db.state.expenses.some((expense) => expense.id === id)).toBe(false);
    for (const queryKey of refetched) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    }
  });
});
