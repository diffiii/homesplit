import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { now } from "@/mocks/db";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import ExpensesPage from "../page";
import BalancesPage from "./page";

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

const userId = (email: string) => {
  const found = db.userByEmail(email);
  if (!found) {
    throw new Error(`The scenario has no user ${email}`);
  }
  return found.id;
};

const ALICE = "alice@example.com";
const BARTEK = "bartek@example.com";
const CELINA = "celina@example.com";
const DAWID = "dawid@example.com";
const EWA = "ewa@example.com";

function addPayment(
  householdName: string,
  payer: string,
  payee: string,
  { confirmed = false, amountCents = 1000, note = null as string | null } = {}
) {
  const payerId = userId(payer);
  const time = now();
  db.state.settlements.push({
    id: crypto.randomUUID(),
    householdId: household(householdName).id,
    payerId,
    payeeId: userId(payee),
    createdById: payerId,
    amount: { amountCents, currency: "PLN" },
    note,
    createdAt: time,
    confirmedById: confirmed ? userId(payee) : null,
    confirmedAt: confirmed ? time : null,
  });
}

function renderBalances(householdId: string) {
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <BalancesPage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/balances`,
      params: { householdId },
    }
  );
}

const flat = () => household("Flat on Piękna").id;
const cabin = () => household("Lake cabin").id;

const history = () => screen.findByRole("region", { name: "Payment history" });
const waiting = () => screen.findByRole("region", { name: "Waiting for you" });

const CONFIRM_CELINA = /^Confirm: Celina Wiśniewska paid you/u;
const REJECT_CELINA = /^Reject: Celina Wiśniewska paid you/u;
const WITHDRAW = /^Withdraw: You paid/u;
const CONFIRM_ANY = /^Confirm:/u;
const REMOVE_ANY = /^(?:Reject|Withdraw):/u;
const EXPENSES_WAITING = /^Expenses, 1 to confirm/u;
const BALANCES_WAITING = /^Balances, 1 to confirm/u;

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("the payment history", () => {
  it("shows who paid whom, the note, who recorded it, and its status", async () => {
    renderBalances(flat());

    const rows = within(await history());
    const pending = (await rows.findByText("BLIK")).closest(
      "li"
    ) as HTMLElement;
    expect(pending).toHaveTextContent("Celina Wiśniewska paid you");
    expect(pending).toHaveTextContent("Pending");
    expect(pending).toHaveTextContent("Recorded by Celina Wiśniewska on");
    expect(pending.textContent?.replace(/ /gu, " ")).toContain("PLN 200.00");
    const confirmed = rows
      .getByText("Bartek Kowalski paid you")
      .closest("li") as HTMLElement;
    expect(confirmed).toHaveTextContent("Confirmed");
    expect(
      within(confirmed).queryByRole("button", { name: REMOVE_ANY })
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("loads more payments on request", async () => {
    for (let i = 0; i < 25; i += 1) {
      addPayment("Lake cabin", EWA, ALICE, { confirmed: true });
    }
    const { user } = renderBalances(cabin());

    const section = within(await history());
    expect(await section.findByText("Showing 20 of 25 payments")).toBeVisible();
    await user.click(section.getByRole("button", { name: "Load more" }));
    expect(await section.findByText("Showing 25 of 25 payments")).toBeVisible();
  });

  it("doesn't repeat a row when someone's new payment shifts the pages", async () => {
    for (let i = 0; i < 25; i += 1) {
      addPayment("Lake cabin", EWA, ALICE, { confirmed: true });
    }
    const { user } = renderBalances(cabin());
    const section = within(await history());
    await section.findByText("Showing 20 of 25 payments");

    addPayment("Lake cabin", EWA, ALICE, { confirmed: true });
    await user.click(section.getByRole("button", { name: "Load more" }));

    expect(await section.findByText("Showing 25 of 26 payments")).toBeVisible();
    expect(section.getAllByText("Ewa Zielińska paid you")).toHaveLength(25);
  });

  it("says when there are no payments yet", async () => {
    renderBalances(cabin());

    expect(await screen.findByText("No payments yet")).toBeVisible();
  });
});

describe("pending payments", () => {
  it("counts what waits for the user in the nav and on the way to balances", async () => {
    const { id } = household("Flat on Piękna");
    renderWithProviders(
      <HouseholdShell householdId={id}>
        <ExpensesPage />
      </HouseholdShell>,
      { url: `/households/${id}/expenses`, params: { householdId: id } }
    );

    expect(
      (await screen.findAllByRole("link", { name: EXPENSES_WAITING })).length
    ).toBeGreaterThan(0);
    expect(
      await screen.findByRole("link", { name: BALANCES_WAITING })
    ).toBeVisible();
  });

  it("lets the payee confirm, which moves the balance and clears the count", async () => {
    const { user } = renderBalances(flat());

    await user.click(
      await within(await waiting()).findByRole("button", {
        name: CONFIRM_CELINA,
      })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Confirm this payment?",
    });
    expect(dialog).toHaveTextContent("can't be undone");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await screen.findByText("Payment confirmed.");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Waiting for you" })
      ).not.toBeInTheDocument()
    );
    expect(screen.queryAllByRole("link", { name: EXPENSES_WAITING })).toEqual(
      []
    );
    expect(await screen.findByText("Owes PLN 1,083.52")).toBeVisible();
    // The row it was opened from is gone, so focus goes somewhere that isn't.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Record payment" })
      ).toHaveFocus()
    );
  });

  it("lets the payee reject, removing it without touching balances", async () => {
    const before = db.state.settlements.length;
    const { user } = renderBalances(flat());

    await user.click(
      await within(await waiting()).findByRole("button", {
        name: REJECT_CELINA,
      })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Reject this payment?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    await screen.findByText("Payment rejected.");
    expect(db.state.settlements).toHaveLength(before - 1);
    expect(await screen.findByText("Owes PLN 1,283.52")).toBeVisible();
  });

  it("lets the payer withdraw but not confirm their own", async () => {
    addPayment("Lake cabin", ALICE, EWA, { note: "Mine" });
    const { user } = renderBalances(cabin());

    const row = (await within(await history()).findByText("Mine")).closest(
      "li"
    ) as HTMLElement;
    expect(
      within(row).queryByRole("button", { name: CONFIRM_ANY })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Waiting for you" })
    ).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: WITHDRAW }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Withdraw this payment?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await screen.findByText("Payment withdrawn.");
    expect(await screen.findByText("No payments yet")).toBeVisible();
  });

  it("gives a member no actions on other people's payments", async () => {
    addPayment("Lake cabin", BARTEK, EWA, { note: "Theirs" });
    renderBalances(cabin());

    const row = (await within(await history()).findByText("Theirs")).closest(
      "li"
    ) as HTMLElement;
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets an admin act on others' payments without counting them as waiting", async () => {
    addPayment("Flat on Piękna", BARTEK, CELINA, { note: "Between them" });
    renderBalances(flat());

    const row = (
      await within(await history()).findByText("Between them")
    ).closest("li") as HTMLElement;
    expect(
      within(row).getByRole("button", { name: CONFIRM_ANY })
    ).toBeVisible();
    expect(
      within(row).getByRole("button", { name: REMOVE_ANY })
    ).toHaveTextContent("Reject");
    expect(
      within(await waiting()).queryByText("Between them")
    ).not.toBeInTheDocument();
  });

  it("waits for an admin when the payee has left", async () => {
    addPayment("Flat on Piękna", BARTEK, DAWID, { note: "To Dawid" });
    renderBalances(flat());

    expect(await within(await waiting()).findByText("To Dawid")).toBeVisible();
  });

  it("explains a payment someone else has just confirmed", async () => {
    server.use(
      http.delete(
        "*/api/households/:householdId/settlements/:settlementId",
        () =>
          HttpResponse.json(
            { code: "SETTLEMENT_CONFIRMED", message: "Confirmed" },
            { status: 409 }
          )
      )
    );
    const { user } = renderBalances(flat());

    await user.click(
      await within(await waiting()).findByRole("button", {
        name: REJECT_CELINA,
      })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "already been confirmed"
    );
  });

  it("offers no actions or count while expenses are off", async () => {
    household("Flat on Piękna").features.expenses = false;
    renderBalances(flat());

    const section = within(await history());
    await section.findByText("BLIK");
    expect(section.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Waiting for you" })
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: EXPENSES_WAITING })).toEqual(
      []
    );
  });
});
