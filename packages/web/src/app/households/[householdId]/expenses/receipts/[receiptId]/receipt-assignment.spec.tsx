import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { formatMoney } from "@/lib/money";
import type { MockReceipt } from "@/mocks/db";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import { ReceiptScreen } from "./receipt-screen";

const flat = () => {
  const found = db.state.households.find(
    ({ name }) => name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no Flat on Piękna");
  }
  return found;
};

const byMerchant = (merchant: string): MockReceipt => {
  const found = db.state.receipts.find(
    (receipt) => receipt.merchant === merchant
  );
  if (!found) {
    throw new Error(`The scenario has no ${merchant} receipt`);
  }
  return found;
};

/** Beer 3 × 4.99 and pizza 30.00, which add up to the 44.97 total. */
const ready = () => byMerchant("Carrefour Express");

/** Items that come to 1.03 more than the total. */
const mismatched = () => byMerchant("Lidl");

const userId = (name: string) => {
  const found = db.state.users.find((user) => user.name === name);
  if (!found) {
    throw new Error(`The scenario has no ${name}`);
  }
  return found.id;
};

function renderReceipt(receiptId: string) {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ReceiptScreen />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/receipts/${receiptId}`,
      params: { householdId, receiptId },
    }
  );
}

const WHITESPACE = /\s/gu;

/** An amount as `toHaveTextContent` reads it, which turns the no-break space into a plain one. */
const pln = (amountCents: number) =>
  formatMoney({ amountCents, currency: "PLN" }).replace(WHITESPACE, " ");

const item = (name: string) => {
  const items = screen.getByRole("list", { name: "Items" });
  return within(items).getByRole("listitem", { name });
};

const whoHad = (name: string) =>
  screen.getByRole("group", { name: `Who had ${name}` });

const split = () => screen.getByRole("region", { name: "Split" });

const confirmButton = () =>
  screen.getByRole("button", { name: "Add as expense" });

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("ReceiptAssignment", () => {
  it("opens on assigning once the items add up", async () => {
    renderReceipt(ready().id);

    expect(
      await screen.findByRole("heading", { name: "Who had what" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Assign items", pressed: true })
    ).toBeVisible();
    expect(item("Beer 0.5 L")).toHaveTextContent(
      `3 × ${pln(499)} = ${pln(1497)}`
    );
    expect(item("Beer 0.5 L")).toHaveTextContent("0/3 assigned");
    expect(item("Pizza")).toHaveTextContent("Unassigned");
    expect(
      within(whoHad("Pizza")).getByRole("button", {
        name: "Alice Nowak (you)",
        pressed: false,
      })
    ).toBeVisible();
    // Defaults from the receipt: the scanner paid, and the confident category.
    const details = screen.getByRole("region", { name: "Expense" });
    expect(within(details).getByLabelText("Name")).toHaveValue(
      "Carrefour Express"
    );
    expect(
      within(details).getByRole("combobox", { name: "Paid by" })
    ).toHaveTextContent("Celina Wiśniewska");
    await waitFor(() =>
      expect(
        within(details).getByRole("combobox", { name: "Category" })
      ).toHaveTextContent("Groceries")
    );
    await waitFor(() =>
      expect(split()).toHaveTextContent(`Unassigned${pln(4497)}`)
    );
    expect(confirmButton()).toBeDisabled();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("assigns units and equal shares, then adds the expense", async () => {
    const { user } = renderReceipt(ready().id);
    await screen.findByRole("heading", { name: "Who had what" });

    // Beer: Alice 2 units, Bartek 1.
    await user.click(
      within(whoHad("Beer 0.5 L")).getByRole("button", {
        name: "Alice Nowak (you)",
      })
    );
    await user.click(
      within(whoHad("Beer 0.5 L")).getByRole("button", {
        name: "Bartek Kowalski",
      })
    );
    expect(item("Beer 0.5 L")).toHaveTextContent("2/3 assigned");
    await user.click(
      within(item("Beer 0.5 L")).getByRole("button", {
        name: "One more for you",
      })
    );
    expect(item("Beer 0.5 L")).toHaveTextContent("3/3 assigned");

    // Pizza: everyone equally, by selecting it.
    await user.click(screen.getByRole("checkbox", { name: "Select Pizza" }));
    const selection = screen.getByRole("region", { name: "Selected items" });
    const pick = (name: string) =>
      user.click(within(selection).getByRole("button", { name }));
    await pick("Alice Nowak (you)");
    await pick("Bartek Kowalski");
    await pick("Celina Wiśniewska");
    await user.click(
      within(selection).getByRole("button", {
        name: "Split between 3 people",
      })
    );

    // The example from #56: A 19.98, B 14.99, C 10.00.
    const parts = within(split()).getByRole("list", {
      name: "Each person's part",
    });
    await waitFor(() =>
      expect(
        within(parts)
          .getAllByRole("listitem")
          .map((row) => row.textContent?.replace(WHITESPACE, " "))
      ).toEqual([
        expect.stringContaining(`Alice Nowak (you)${pln(1998)}`),
        expect.stringContaining(`Bartek Kowalski${pln(1499)}`),
        expect.stringContaining(`Celina Wiśniewska${pln(1000)}`),
      ])
    );
    expect(split()).toHaveTextContent("The items add up to the total.");
    await waitFor(() => expect(confirmButton()).toBeEnabled());

    await user.click(confirmButton());

    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    const receipt = ready();
    const expense = db.state.expenses.find(
      ({ id }) => id === receipt.expenseId
    );
    expect(receipt.status).toBe("confirmed");
    expect(router.push).toHaveBeenCalledWith(
      `/households/${flat().id}/expenses/${expense?.id}`
    );
    expect(expense).toMatchObject({
      name: "Carrefour Express",
      total: { amountCents: 4497, currency: "PLN" },
      payers: [{ userId: userId("Celina Wiśniewska"), amountCents: 4497 }],
      allocation: {
        method: "exact",
        participants: expect.arrayContaining([
          { userId: userId("Alice Nowak"), amountCents: 1998 },
          { userId: userId("Bartek Kowalski"), amountCents: 1499 },
          { userId: userId("Celina Wiśniewska"), amountCents: 1000 },
        ]),
      },
    });
    expect(
      db.state.expenseAttachments.some(
        (link) =>
          link.expenseId === expense?.id &&
          link.attachmentId === receipt.attachmentId
      )
    ).toBe(true);
    // The shopping module is on, so it offers to tick off what was bought.
    expect(
      await screen.findByRole("button", { name: "Tick off items" })
    ).toBeVisible();
  }, 20_000);

  it("offers a category the scan isn't sure about without filling it in", async () => {
    const receipt = ready();
    const suggested = receipt.suggestedCategory;
    if (!suggested) {
      throw new Error("The receipt has no suggested category");
    }
    receipt.suggestedCategory = { ...suggested, confidence: "medium" };
    const { user } = renderReceipt(receipt.id);
    const details = await screen.findByRole("region", { name: "Expense" });
    const category = () =>
      within(details).getByRole("combobox", { name: "Category" });

    expect(
      await within(details).findByText(
        "The scan suggests Groceries, but isn't sure.",
        { exact: false }
      )
    ).toBeVisible();
    expect(category()).toHaveTextContent("No category");

    await user.click(
      within(details).getByRole("button", { name: "Use Groceries" })
    );

    expect(category()).toHaveTextContent("Groceries");
    expect(within(details).getByText("Suggested by the scan")).toBeVisible();
  });

  it("gives an item to everyone with one tap, and takes it back", async () => {
    const { user } = renderReceipt(ready().id);
    await screen.findByRole("heading", { name: "Who had what" });
    const pizza = () => ready().items.find(({ name }) => name === "Pizza");
    const everyone = () =>
      within(whoHad("Pizza")).getByRole("button", { name: "Everyone" });

    await user.click(everyone());

    expect(everyone()).toHaveAttribute("aria-pressed", "true");
    for (const name of [
      "Alice Nowak (you)",
      "Bartek Kowalski",
      "Celina Wiśniewska",
    ]) {
      expect(
        within(whoHad("Pizza")).getByRole("button", { name, pressed: true })
      ).toBeVisible();
    }
    await waitFor(() => expect(pizza()?.assignments).toHaveLength(3));

    await user.click(everyone());

    expect(everyone()).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(pizza()?.assignments).toHaveLength(0));
    expect(item("Pizza")).toHaveTextContent("Unassigned");
  });

  it("assigns the selected items to everyone", async () => {
    const { user } = renderReceipt(ready().id);
    await screen.findByRole("heading", { name: "Who had what" });

    await user.click(screen.getByRole("checkbox", { name: "Select Pizza" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Select Beer 0.5 L" })
    );
    const selection = screen.getByRole("region", { name: "Selected items" });
    await user.click(
      within(selection).getByRole("button", { name: "Everyone" })
    );
    await user.click(
      within(selection).getByRole("button", {
        name: "Split between 3 people",
      })
    );

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(ready().items.map(({ assignments }) => assignments.length)).toEqual([
      3, 3,
    ]);
  });

  it("splits everything equally in one step", async () => {
    const { user } = renderReceipt(ready().id);
    await screen.findByRole("heading", { name: "Who had what" });

    await user.click(
      screen.getByRole("button", { name: "Split everything equally" })
    );

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(ready().items.map(({ assignments }) => assignments.length)).toEqual([
      3, 3,
    ]);
    expect(split()).toHaveTextContent(`Unassigned${pln(0)}`);
  });

  it("keeps the expense until items that don't add up are fixed", async () => {
    const { user } = renderReceipt(mismatched().id);

    // It opens on the items, which need fixing first.
    expect(
      await screen.findByRole("button", { name: "Edit items", pressed: true })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Assign items" }));
    await user.click(
      screen.getByRole("button", { name: "Split everything equally" })
    );

    await waitFor(() =>
      expect(split()).toHaveTextContent(
        `The items come to ${pln(103)} more than the total.`
      )
    );
    expect(split()).toHaveTextContent(
      "Fix the items under Edit items so they add up to the total."
    );
    expect(confirmButton()).toBeDisabled();

    await user.click(
      within(split()).getByRole("button", { name: "Edit items" })
    );
    expect(
      screen.getByRole("button", { name: "Edit items", pressed: true })
    ).toBeVisible();
  });

  it("says when item edits aren't saved yet", async () => {
    const { user } = renderReceipt(ready().id);
    await user.click(await screen.findByRole("button", { name: "Edit items" }));
    await user.type(screen.getByLabelText("Shop"), " Kraków");
    await user.click(screen.getByRole("button", { name: "Assign items" }));

    expect(
      await screen.findByText("Your item edits aren't saved")
    ).toBeVisible();
  });

  it("explains when someone on the items has left", async () => {
    server.use(
      http.post(
        "*/api/households/:householdId/receipts/:receiptId/confirm",
        () =>
          HttpResponse.json(
            {
              code: "RECEIPT_ASSIGNEE_NOT_MEMBER",
              message: "Items are assigned to someone who left the household",
            },
            { status: 409 }
          )
      )
    );
    const { user } = renderReceipt(ready().id);
    await user.click(
      await screen.findByRole("button", { name: "Split everything equally" })
    );
    await waitFor(() => expect(confirmButton()).toBeEnabled());

    await user.click(confirmButton());

    expect(
      await screen.findByText(
        "Someone the items are assigned to has left the household. Take them off the items first."
      )
    ).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });
});
