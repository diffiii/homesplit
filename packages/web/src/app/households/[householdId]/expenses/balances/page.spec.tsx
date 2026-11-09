import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { queryKeys } from "@/lib/api/query-keys";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
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

const flatId = () => household("Flat on Piękna").id;
const cabinId = () => household("Lake cabin").id;

const group = (currency: string) =>
  screen.findByRole("region", { name: new RegExp(`^${currency}`, "u") });

const rowOf = async (currency: string, name: string) =>
  within(await group(currency))
    .getByText(name, { exact: false })
    .closest("li") as HTMLElement;

const MAY_BE_PAID = /may already be paid/u;
const MAY_HAVE_GONE_THROUGH = /may have gone through/u;
const RECORD_BARTEK_EUR = /^Record: Bartek Kowalski pays you EUR/u;
const RECORD_CELINA_EUR = /^Record: Celina Wiśniewska pays you EUR/u;
const RECORD_PAY_EWA = /^Record: You pay Ewa/u;
const RECORD_BARTEK_EWA = /^Record: Bartek Kowalski pays Ewa/u;
const WAITING_TO_BE_CONFIRMED = /waiting to be confirmed/u;
const WRITE_OFF_PLN = "Write off Dawid Lewandowski's balance in PLN";
const FORGIVE = /^Forgive/u;
const SPLIT = /^Split/u;
const WAS_WRITTEN_OFF = /was written off/u;

const namesOfPayments = (dialog: HTMLElement) =>
  within(within(dialog).getByRole("list", { name: "Payments to record" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace(/\u00a0/gu, " "));

const userIn = (email: string) => {
  const found = db.userByEmail(email);
  if (!found) {
    throw new Error(`The scenario has no ${email}`);
  }
  return found;
};

async function pick(
  user: ReturnType<typeof renderBalances>["user"],
  dialog: HTMLElement,
  field: string,
  option: RegExp | string
) {
  await user.click(within(dialog).getByRole("combobox", { name: field }));
  await user.click(await screen.findByRole("option", { name: option }));
}

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("BalancesPage", () => {
  it("groups by currency, phrases the user's own, and marks who left", async () => {
    renderBalances(flatId());

    expect(await group("EUR")).toHaveTextContent("Euro");
    const own = await rowOf("PLN", "Alice Nowak");
    expect(own).toHaveClass("bg-muted");
    expect(own).toHaveTextContent("Alice Nowak (you)");
    expect(own.textContent?.replace(/ /gu, " ")).toContain(
      "You're owed PLN 2,687.21"
    );
    expect(
      (await rowOf("EUR", "Alice Nowak")).textContent?.replace(/ /gu, " ")
    ).toContain("You're owed EUR 90.00");

    const dawid = await rowOf("PLN", "Dawid Lewandowski");
    expect(dawid).toHaveTextContent("Left the household");
    expect(dawid.textContent?.replace(/ /gu, " ")).toContain(
      "Owes PLN 1,057.50"
    );
    expect(
      within(await group("EUR")).queryByText("Dawid Lewandowski")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("shows a settled-up state when every balance is zero", async () => {
    const { id } = household("Flat on Piękna");
    db.state.expenses = db.state.expenses.filter(
      ({ householdId }) => householdId !== id
    );
    db.state.settlements = db.state.settlements.filter(
      ({ householdId }) => householdId !== id
    );
    renderBalances(id);

    expect(await screen.findByText("All settled up")).toBeVisible();
    expect(screen.queryByText("Suggested payments")).not.toBeInTheDocument();
  });

  it("keeps the screen readable while expenses are off", async () => {
    household("Flat on Piękna").features.expenses = false;
    renderBalances(flatId());

    expect(await screen.findByText("Expenses are turned off")).toBeVisible();
    expect(await group("PLN")).toBeVisible();
    await screen.findByText("Suggested payments");
    expect(
      screen.queryByRole("button", { name: "Record payment" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: WRITE_OFF_PLN })
    ).not.toBeInTheDocument();
  });

  it("lists the user's own suggestions first", async () => {
    const someone = (name: string, id: string) => ({
      id,
      name,
      imageUrl: null,
    });
    const alice = db.userByEmail("alice@example.com");
    server.use(
      http.get("*/api/households/:householdId/settlement-suggestions", () =>
        HttpResponse.json({
          items: [
            {
              currency: "PLN",
              suggestions: [
                {
                  payer: someone("Celina", crypto.randomUUID()),
                  payee: someone("Bartek", crypto.randomUUID()),
                  amountCents: 2000,
                },
                {
                  payer: someone("Bartek", crypto.randomUUID()),
                  payee: someone("Alice", alice?.id ?? ""),
                  amountCents: 1000,
                },
              ],
            },
          ],
        })
      )
    );
    renderBalances(flatId());

    const list = await screen.findByRole("list", {
      name: "Suggested payments in PLN",
    });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Bartek pays you");
    expect(second).toHaveTextContent("Celina pays Bartek");
  });

  it("opens a suggestion filled in, confirms it, and refetches", async () => {
    const { user, queryClient } = renderBalances(flatId());
    const history = queryKeys.endpoint("listSettlements", {
      params: { householdId: flatId() },
    });
    queryClient.setQueryData(history, { items: [] });

    await user.click(
      await screen.findByRole("button", {
        name: RECORD_CELINA_EUR,
      })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Record a payment",
    });
    expect(
      within(dialog).getByRole("combobox", { name: "Who paid" })
    ).toHaveTextContent("Celina Wiśniewska");
    expect(
      within(dialog).getByRole("combobox", { name: "Who got paid" })
    ).toHaveTextContent("Alice Nowak (you)");
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("45.00");
    expect(
      within(dialog).getByRole("combobox", { name: "Currency" })
    ).toHaveValue("EUR · Euro");
    expect(dialog).toHaveTextContent("confirmed right away");
    await expectNoAxeViolations(document.body, AXE_OPTIONS);

    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );

    await screen.findByText("Payment recorded.");
    await waitFor(async () =>
      expect(
        (await rowOf("EUR", "Alice Nowak")).textContent?.replace(/ /gu, " ")
      ).toContain("You're owed EUR 45.00")
    );
    expect(
      within(await group("EUR")).queryByText("Celina Wiśniewska")
    ).toBeInTheDocument();
    expect(queryClient.getQueryState(history)?.isInvalidated).toBe(true);
    expect(db.state.settlements.at(-1)?.confirmedAt).not.toBeNull();
  });

  it("says a payment the payer records stays pending, and balances wait", async () => {
    const { user } = renderBalances(cabinId());

    await user.click(
      await screen.findByRole("button", { name: RECORD_PAY_EWA })
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "stays pending until Ewa Zielińska or an admin confirms it"
    );
    await user.type(within(dialog).getByLabelText("Note (optional)"), " BLIK ");
    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );

    expect(await screen.findByText(WAITING_TO_BE_CONFIRMED)).toBeVisible();
    const recorded = db.state.settlements.at(-1);
    expect(recorded?.confirmedAt).toBeNull();
    expect(recorded?.note).toBe("BLIK");
    expect(
      (await rowOf("EUR", "Alice Nowak")).textContent?.replace(/ /gu, " ")
    ).toContain("You owe EUR 320.00");
  });

  it("offers a member only payments they're part of", async () => {
    const { user } = renderBalances(cabinId());

    // Alice has no say over Bartek's payment to Ewa.
    await screen.findByRole("button", { name: RECORD_PAY_EWA });
    expect(
      screen.queryByRole("button", {
        name: RECORD_BARTEK_EWA,
      })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("combobox", { name: "Who paid" })
    ).toHaveTextContent("Alice Nowak (you)");

    // When someone else paid, the payee can only be her.
    await pick(user, dialog, "Who paid", "Ewa Zielińska");
    expect(
      within(dialog).getByRole("combobox", { name: "Who got paid" })
    ).toHaveTextContent("Alice Nowak (you)");
    await user.click(
      within(dialog).getByRole("combobox", { name: "Who got paid" })
    );
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent)
    ).toEqual(["Alice Nowak (you)"]);
  });

  it("lets an admin record between any two parties, including people who left", async () => {
    const { user } = renderBalances(flatId());

    await user.click(
      await screen.findByRole("button", { name: "Record payment" })
    );
    const dialog = await screen.findByRole("dialog");
    await pick(user, dialog, "Who paid", "Bartek Kowalski");
    await pick(user, dialog, "Who got paid", "Dawid Lewandowski (left)");
    expect(dialog).toHaveTextContent("confirmed right away");
    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );

    expect(await within(dialog).findByText("Enter an amount.")).toBeVisible();
    await user.type(within(dialog).getByLabelText("Amount"), "12,50");
    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );

    await screen.findByText("Payment recorded.");
    expect(db.state.settlements.at(-1)?.amount).toEqual({
      amountCents: 1250,
      currency: "EUR",
    });
  });

  const failing = (path: string) =>
    http.get(`*/api/households/:householdId/${path}`, () =>
      HttpResponse.json({ code: "INTERNAL", message: "Down" }, { status: 500 })
    );

  it("keeps the list and flags it when refreshing the balances fails", async () => {
    const { user } = renderBalances(flatId());
    await user.click(
      await screen.findByRole("button", { name: RECORD_CELINA_EUR })
    );
    const dialog = await screen.findByRole("dialog");

    server.use(failing("balances"));
    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );

    await screen.findByText("Payment recorded.");
    expect(await group("EUR")).toBeVisible();
    expect(
      await screen.findByText(
        "Couldn't refresh the balances, so these may be out of date."
      )
    ).toBeVisible();
  });

  it("keeps an open form and what's typed in it when a refetch fails", async () => {
    server.use(failing("balances"));
    const { user, queryClient } = renderBalances(flatId());
    server.resetHandlers();
    await user.click(
      await screen.findByRole("button", { name: "Record payment" })
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Amount"), "12,50");

    server.use(failing("balances"));
    await queryClient.invalidateQueries({
      queryKey: queryKeys.endpoint("listBalances", {
        params: { householdId: flatId() },
      }),
    });

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("12,50");
  });

  it("won't record a suggestion that may already be paid until it's refreshed", async () => {
    const before = db.state.settlements.length;
    const { user } = renderBalances(flatId());
    await user.click(
      await screen.findByRole("button", { name: RECORD_CELINA_EUR })
    );
    const dialog = await screen.findByRole("dialog");

    server.use(failing("settlement-suggestions"));
    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );
    await screen.findByText("Payment recorded.");

    // Still listed, as the refresh failed, but no longer recordable.
    expect(await screen.findByText(MAY_BE_PAID)).toBeVisible();
    const list = screen.getByRole("list", {
      name: "Suggested payments in EUR",
    });
    expect(within(list).getByText("Celina Wiśniewska pays you")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: RECORD_CELINA_EUR })
    ).not.toBeInTheDocument();
    expect(db.state.settlements).toHaveLength(before + 1);

    server.resetHandlers();
    const banner = screen
      .getByText(MAY_BE_PAID)
      .closest("[role=alert]") as HTMLElement;
    await user.click(within(banner).getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText(MAY_BE_PAID)).not.toBeInTheDocument()
    );
    expect(
      within(
        screen.getByRole("list", { name: "Suggested payments in EUR" })
      ).queryByText("Celina Wiśniewska pays you")
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: RECORD_BARTEK_EUR })
    ).toBeVisible();
  });

  it("warns against resending a payment whose answer never came", async () => {
    const { user } = renderBalances(flatId());
    await user.click(
      await screen.findByRole("button", { name: RECORD_CELINA_EUR })
    );
    const dialog = await screen.findByRole("dialog");

    server.use(
      http.post("*/api/households/:householdId/settlements", () =>
        HttpResponse.error()
      )
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Record payment" })
    );

    expect(
      await within(dialog).findByText(MAY_HAVE_GONE_THROUGH)
    ).toBeVisible();
  });

  it("moves focus to the record button when the suggestion's row is gone", async () => {
    const { user } = renderBalances(flatId());
    await user.click(
      await screen.findByRole("button", { name: RECORD_CELINA_EUR })
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Record payment",
      })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: RECORD_CELINA_EUR })
      ).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Record payment" })
      ).toHaveFocus()
    );
  });

  it("returns focus to the button when a payment is cancelled", async () => {
    const { user } = renderBalances(flatId());
    const button = await screen.findByRole("button", {
      name: RECORD_CELINA_EUR,
    });
    await user.click(button);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      })
    );

    await waitFor(() => expect(button).toHaveFocus());
  });

  it("asks for another admin when an admin pays someone who left", async () => {
    const { user } = renderBalances(flatId());
    await user.click(
      await screen.findByRole("button", { name: "Record payment" })
    );
    const dialog = await screen.findByRole("dialog");
    await pick(user, dialog, "Who got paid", "Dawid Lewandowski (left)");

    expect(dialog).toHaveTextContent(
      "stays pending until another admin confirms it"
    );
  });

  /** Open the write-off dialog for Dawid's PLN debt with `method`. */
  async function openWriteOff(method: RegExp) {
    const rendered = renderBalances(flatId());
    const button = await rendered.findByRole("button", { name: WRITE_OFF_PLN });
    await rendered.user.click(button);
    await rendered.user.click(
      await screen.findByRole("menuitem", { name: method })
    );
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Write off" })
      ).toBeEnabled()
    );
    return { ...rendered, button, dialog };
  }

  it("forgives a departed member's debt, the creditors taking the loss", async () => {
    const { user, dialog } = await openWriteOff(FORGIVE);
    expect(namesOfPayments(dialog)).toEqual([
      "Dawid Lewandowski → Alice NowakPLN 1,057.50",
    ]);
    await expectNoAxeViolations(document.body, AXE_OPTIONS);

    await user.click(within(dialog).getByRole("button", { name: "Write off" }));

    await screen.findByText(WAS_WRITTEN_OFF);
    expect(db.state.settlements.at(-1)).toMatchObject({
      note: "Write-off",
      amount: { amountCents: 105_750, currency: "PLN" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: WRITE_OFF_PLN })
      ).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Record payment" })
      ).toHaveFocus()
    );
  });

  it("splits a departed member's debt equally among current members", async () => {
    const before = db.state.settlements.length;
    const { user, dialog } = await openWriteOff(SPLIT);
    expect(namesOfPayments(dialog)).toEqual([
      "Dawid Lewandowski → Alice NowakPLN 352.50",
      "Dawid Lewandowski → Bartek KowalskiPLN 352.50",
      "Dawid Lewandowski → Celina WiśniewskaPLN 352.50",
    ]);

    await user.click(within(dialog).getByRole("button", { name: "Write off" }));

    await screen.findByText(WAS_WRITTEN_OFF);
    const recorded = db.state.settlements.slice(before);
    expect(recorded).toHaveLength(3);
    for (const payment of recorded) {
      expect(payment.note).toBe("Write-off");
      expect(payment.confirmedAt).not.toBeNull();
    }
  });

  it("returns focus to the write-off button when it's cancelled", async () => {
    const { user, button, dialog } = await openWriteOff(FORGIVE);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(button).toHaveFocus());
  });

  it("shows the new payments when the balance changed while it was open", async () => {
    const { user, dialog } = await openWriteOff(FORGIVE);
    // Someone records part of Dawid's debt in the meantime.
    db.state.settlements.push({
      id: crypto.randomUUID(),
      householdId: flatId(),
      payerId: userIn("dawid@example.com").id,
      payeeId: userIn("alice@example.com").id,
      createdById: userIn("alice@example.com").id,
      amount: { amountCents: 57_500, currency: "PLN" },
      note: null,
      createdAt: new Date().toISOString(),
      confirmedById: userIn("alice@example.com").id,
      confirmedAt: new Date().toISOString(),
    });

    await user.click(within(dialog).getByRole("button", { name: "Write off" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "balance in PLN has changed, so nothing was recorded"
    );
    await waitFor(() =>
      expect(namesOfPayments(dialog)).toEqual([
        "Dawid Lewandowski → Alice NowakPLN 482.50",
      ])
    );
  });

  it("says why when the departed member has pending payments", async () => {
    db.state.settlements.push({
      id: crypto.randomUUID(),
      householdId: flatId(),
      payerId: userIn("bartek@example.com").id,
      payeeId: userIn("dawid@example.com").id,
      createdById: userIn("bartek@example.com").id,
      amount: { amountCents: 10_000, currency: "PLN" },
      note: null,
      createdAt: new Date().toISOString(),
      confirmedById: null,
      confirmedAt: null,
    });
    const before = db.state.settlements.length;
    const { user, dialog } = await openWriteOff(SPLIT);

    await user.click(within(dialog).getByRole("button", { name: "Write off" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Payments with Dawid Lewandowski in PLN are pending"
    );
    expect(db.state.settlements).toHaveLength(before);
  });

  it("stops offering the write-off when the member has rejoined", async () => {
    const { user, dialog } = await openWriteOff(SPLIT);
    db.state.members.push({
      id: crypto.randomUUID(),
      householdId: flatId(),
      userId: userIn("dawid@example.com").id,
      role: "member",
      createdAt: new Date().toISOString(),
    });

    await user.click(within(dialog).getByRole("button", { name: "Write off" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Dawid Lewandowski is a member again"
    );
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("list", { name: "Payments to record" })
      ).not.toBeInTheDocument()
    );
    expect(
      within(dialog).getByRole("button", { name: "Write off" })
    ).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Dawid Lewandowski is a member again"
    );
  });

  it("doesn't offer write-offs to anyone but admins and owners", async () => {
    const memberRow = (email: string) =>
      db.state.members.find(
        (member) =>
          member.householdId === flatId() && member.userId === userIn(email).id
      );
    const alice = memberRow("alice@example.com");
    const bartek = memberRow("bartek@example.com");
    if (!(alice && bartek)) {
      throw new Error("The scenario has no Alice or Bartek in the flat");
    }
    alice.role = "member";
    bartek.role = "owner";
    renderBalances(flatId());

    await rowOf("PLN", "Dawid Lewandowski");
    await screen.findByText("Suggested payments");
    expect(
      screen.queryByRole("button", { name: WRITE_OFF_PLN })
    ).not.toBeInTheDocument();
  });
});
