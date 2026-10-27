import { screen, waitFor, within } from "@testing-library/react";
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
const KWD = /^KWD/;
const PLN_63 = /^PLN\s63/;
const PLN_60 = /^PLN\s60/;

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

/** A list's group, such as "Paid by". */
const group = (name: string) => screen.getByRole("group", { name });
/** Text with the non-breaking spaces `Intl` puts in amounts made plain. */
const plain = (text: string | null | undefined) =>
  (text ?? "").replace(/\s/g, " ");
/** The running check under a list. */
const checkOf = (name: string) =>
  plain(group(name).querySelector("[aria-live]")?.textContent);

/** Open the advanced section of a form with a name and an amount. */
async function openAdvanced(amount = "90") {
  const rendered = renderForm();
  const { user } = rendered;
  await user.type(await screen.findByLabelText("Name"), "Pizza");
  await user.type(screen.getByLabelText("Amount"), amount);
  await user.click(screen.getByRole("button", { name: "Split another way" }));
  return rendered;
}

async function pickMethod(
  user: Awaited<ReturnType<typeof openAdvanced>>["user"],
  method: string
) {
  await user.click(screen.getByRole("combobox", { name: "Split" }));
  await user.click(await screen.findByRole("option", { name: method }));
}

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

  it("forgets an amount error once another currency makes it valid", async () => {
    const { user } = renderForm();
    await user.type(await screen.findByLabelText("Name"), "Pizza");
    await user.type(screen.getByLabelText("Amount"), "1.234");
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(
      await screen.findByText("PLN amounts have at most 2 decimals.")
    ).toBeVisible();

    const currency = screen.getByRole("combobox", { name: "Currency" });
    await user.clear(currency);
    await user.type(currency, "KWD");
    await user.click(await screen.findByRole("option", { name: KWD }));
    expect(
      screen.queryByText("PLN amounts have at most 2 decimals.")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
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

  it("opens the advanced section, and goes back only while the expense fits", async () => {
    const { user } = await openAdvanced();

    const payers = group("Paid by");
    expect(within(payers).getByRole("checkbox", { name: ALICE })).toHaveFocus();
    expect(
      screen.getByRole("textbox", { name: "Amount you paid" })
    ).toHaveValue("90.00");
    expect(checkOf("Paid by")).toBe("Adds up to the amount.");
    await expectNoAxeViolations(document.body, AXE_OPTIONS);

    await user.click(within(payers).getByRole("checkbox", { name: BARTEK }));
    expect(
      screen.queryByRole("button", { name: "Back to simple" })
    ).not.toBeInTheDocument();
    await user.click(within(payers).getByRole("checkbox", { name: BARTEK }));
    await pickMethod(user, "By shares");
    expect(
      screen.queryByRole("button", { name: "Back to simple" })
    ).not.toBeInTheDocument();
    await pickMethod(user, "Split equally");

    await user.click(screen.getByRole("button", { name: "Back to simple" }));
    expect(
      screen.getByRole("button", { name: "Split another way" })
    ).toHaveFocus();
    expect(
      screen.getByText("You paid. It's split equally between everyone checked.")
    ).toBeVisible();
  });

  it("splits what's paid between payers and shows what's unassigned", async () => {
    const { user } = await openAdvanced();
    await user.click(
      within(group("Paid by")).getByRole("checkbox", { name: BARTEK })
    );

    const mine = screen.getByRole("textbox", { name: "Amount you paid" });
    const bartek = screen.getByRole("textbox", {
      name: "Amount Bartek Kowalski paid",
    });
    expect(mine).toHaveValue("45.00");
    expect(bartek).toHaveValue("45.00");

    await user.clear(mine);
    await user.type(mine, "60");
    expect(bartek).toHaveValue("45.00");
    expect(checkOf("Paid by")).toBe("PLN 15.00 over the amount.");
    await user.clear(bartek);
    expect(checkOf("Paid by")).toBe("PLN 30.00 unassigned.");
    await user.type(bartek, "30");
    expect(checkOf("Paid by")).toBe("Adds up to the amount.");
  });

  it("keeps the people checked across methods and previews each one", async () => {
    const { user } = await openAdvanced();
    const split = () => group("Split between");
    await user.click(within(split()).getByRole("checkbox", { name: CELINA }));

    await pickMethod(user, "By percentage");
    expect(
      within(split()).getByRole("checkbox", { name: CELINA })
    ).not.toBeChecked();
    const mine = screen.getByRole("textbox", { name: "Your percentage" });
    expect(mine).toHaveValue("50");
    expect(checkOf("Split between")).toBe("Adds up to 100%.");
    await user.clear(mine);
    await user.type(mine, "70");
    expect(checkOf("Split between")).toBe("20% over 100%.");
    const bartek = screen.getByRole("textbox", {
      name: "Bartek Kowalski's percentage",
    });
    await user.clear(bartek);
    await user.type(bartek, "30");
    expect(checkOf("Split between")).toBe("Adds up to 100%.");
    expect(plain(within(split()).getByText(PLN_63).textContent)).toBe(
      "PLN 63.00"
    );

    await pickMethod(user, "By shares");
    expect(
      within(split()).getByRole("checkbox", { name: CELINA })
    ).not.toBeChecked();
    const shares = screen.getByRole("textbox", { name: "Your shares" });
    await user.clear(shares);
    await user.type(shares, "2");
    expect(checkOf("Split between")).toBe("3 shares in total.");
    expect(plain(within(split()).getByText(PLN_60).textContent)).toBe(
      "PLN 60.00"
    );
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("warns when adjustments leave someone a negative share", async () => {
    const { user } = await openAdvanced();
    await pickMethod(user, "Equally, with adjustments");

    await user.type(
      screen.getByRole("textbox", { name: "Your adjustment" }),
      "100"
    );
    expect(checkOf("Split between")).toBe(
      "Bartek Kowalski and Celina Wiśniewska would get a negative share."
    );
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(
      await screen.findAllByText("This would leave them a negative share.")
    ).toHaveLength(2);
    expect(
      screen.getByRole("textbox", { name: "Bartek Kowalski's adjustment" })
    ).toHaveAttribute("aria-invalid", "true");

    // Fixing it anywhere clears the messages on every row.
    await user.clear(screen.getByRole("textbox", { name: "Your adjustment" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your adjustment" }),
      "-6"
    );
    expect(
      screen.queryByText("This would leave them a negative share.")
    ).not.toBeInTheDocument();
    expect(checkOf("Split between")).toBe(
      "PLN 96.00 is split equally before adjustments."
    );
  });

  it("asks for the payers to add up, and forgets it once they do", async () => {
    const { user } = await openAdvanced();
    const mine = screen.getByRole("textbox", { name: "Amount you paid" });
    await user.clear(mine);
    await user.type(mine, "80");
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(
      await screen.findByText("What everyone paid must add up to the amount.")
    ).toBeVisible();

    await user.click(
      within(group("Paid by")).getByRole("checkbox", { name: CELINA })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Amount Celina Wiśniewska paid" }),
      "10"
    );
    expect(
      screen.queryByText("What everyone paid must add up to the amount.")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });

  it("saves several payers and an exact split", async () => {
    const { user } = await openAdvanced("100");
    await user.click(
      within(group("Paid by")).getByRole("checkbox", { name: BARTEK })
    );
    await pickMethod(user, "Exact amounts");
    expect(screen.getByRole("textbox", { name: "Your amount" })).toHaveValue(
      "33.34"
    );
    expect(checkOf("Split between")).toBe("Adds up to the amount.");
    const celina = screen.getByRole("textbox", {
      name: "Celina Wiśniewska's amount",
    });
    await user.clear(celina);
    await user.type(celina, "13.33");
    await user.clear(screen.getByRole("textbox", { name: "Your amount" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your amount" }),
      "53.34"
    );
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const alice = userId("alice@example.com");
    const bartek = userId("bartek@example.com");
    const celinaId = userId("celina@example.com");
    expect(
      db.state.expenses.find(({ name }) => name === "Pizza")
    ).toMatchObject({
      total: { amountCents: 10_000, currency: "PLN" },
      payers: [
        { userId: alice, amountCents: 5000 },
        { userId: bartek, amountCents: 5000 },
      ],
      allocation: {
        method: "exact",
        participants: [
          { userId: alice, amountCents: 5334 },
          { userId: bartek, amountCents: 3333 },
          { userId: celinaId, amountCents: 1333 },
        ],
      },
    });
  });

  it("names a payer who left meanwhile on the payer list", async () => {
    const householdId = flat().id;
    const { user } = await openAdvanced();
    const payers = group("Paid by");
    await user.click(within(payers).getByRole("checkbox", { name: ALICE }));
    await user.click(within(payers).getByRole("checkbox", { name: BARTEK }));

    const bartek = userId("bartek@example.com");
    db.state.members = db.state.members.filter(
      (member) =>
        !(member.householdId === householdId && member.userId === bartek)
    );
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(
      await within(group("Paid by")).findByText(
        "Bartek Kowalski left the household. Uncheck them to save."
      )
    ).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
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
