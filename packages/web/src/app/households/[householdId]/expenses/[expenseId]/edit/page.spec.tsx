import type { UpdateExpenseRequest } from "@homesplit/contracts";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { STALE_EXPENSE_MESSAGE } from "@/lib/expense-form";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import EditExpensePage from "./page";

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

const expenseNamed = (name: string) => {
  const found = db.state.expenses.find((expense) => expense.name === name);
  if (!found) {
    throw new Error(`The scenario has no expense ${name}`);
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

function renderEdit(name: string, householdId = flat().id) {
  const { id } = expenseNamed(name);
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <EditExpensePage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/expenses/${id}/edit`,
      params: { householdId, expenseId: id },
    }
  );
}

/** The bodies of the `PATCH` requests sent from now on. */
function capturePatches(): UpdateExpenseRequest[] {
  const bodies: UpdateExpenseRequest[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "PATCH" && request.url.includes("/expenses/")) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

/** A person's checkbox in the list named `list`; someone who left also has a badge in its name. */
const person = (list: string, name: string) =>
  screen
    .getAllByRole("checkbox", {
      name: (accessibleName) => accessibleName.startsWith(name),
    })
    .find((box) => box.closest("fieldset")?.textContent?.startsWith(list));

const DAWID = "Dawid Lewandowski";
// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

describe("EditExpensePage", () => {
  it("opens with the stored values", async () => {
    renderEdit("Pizza night");

    expect(await screen.findByLabelText("Name")).toHaveValue("Pizza night");
    expect(screen.getByLabelText("Amount")).toHaveValue("129.00");
    // Celina paid most of it, so it opens in the advanced section.
    expect(screen.getByLabelText("Amount Celina Wiśniewska paid")).toHaveValue(
      "90.00"
    );
    expect(screen.getByLabelText("Amount you paid")).toHaveValue("39.00");
    expect(screen.getByRole("combobox", { name: "Split" })).toHaveTextContent(
      "Exact amounts"
    );
    expect(screen.getByLabelText("Bartek Kowalski's amount")).toHaveValue(
      "45.00"
    );
    await expectNoAxeViolations(document.body, AXE_OPTIONS);
  });

  it("sends only the changed name, then goes back to the expense", async () => {
    const patches = capturePatches();
    const { id } = expenseNamed("Pizza night");
    const { user } = renderEdit("Pizza night");
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Pizza and drinks");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(patches).toEqual([{ name: "Pizza and drinks" }]);
    expect(router.push).toHaveBeenCalledWith(
      `/households/${flat().id}/expenses/${id}`
    );
  });

  it("sends nothing when nothing changed", async () => {
    const patches = capturePatches();
    const { user } = renderEdit("Pizza night");
    await user.click(
      await screen.findByRole("button", { name: "Save changes" })
    );

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(patches).toEqual([]);
  });

  it("keeps people who left selectable after unchecking them", async () => {
    const { user } = renderEdit("Rent, August");
    const dawid = await waitFor(() => {
      const box = person("Split between", DAWID);
      expect(box).toBeDefined();
      return box as HTMLElement;
    });
    expect(dawid).toBeChecked();

    await user.click(dawid);
    expect(person("Split between", DAWID)).not.toBeChecked();
    await user.click(person("Split between", DAWID) as HTMLElement);
    expect(person("Split between", DAWID)).toBeChecked();
  });

  it("asks to reload when someone else took a departed person off meanwhile", async () => {
    const { user } = renderEdit("Rent, August");
    const amount = await screen.findByLabelText("Amount");
    // Another edit removes Dawid while this one still keeps him.
    const rent = expenseNamed("Rent, August");
    const dawid = userId("dawid@example.com");
    if (rent.allocation.method !== "equal") {
      throw new Error("Rent is split equally");
    }
    rent.allocation = {
      method: "equal",
      participants: rent.allocation.participants.filter(
        (p) => p.userId !== dawid
      ),
    };

    await user.clear(amount);
    await user.type(amount, "4600");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(STALE_EXPENSE_MESSAGE)).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("tells a member they can't edit someone else's expense", async () => {
    // Alice is a plain member of the cabin.
    renderEdit("Cabin rental", householdNamed("Lake cabin").id);

    expect(
      await screen.findByText("You can't edit this expense")
    ).toBeVisible();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("doesn't offer the form while expenses are turned off", async () => {
    flat().features.expenses = false;
    renderEdit("Pizza night");

    expect(await screen.findByText("Expenses are turned off")).toBeVisible();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
});
