import { act, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { SHOPPING_POLL_INTERVAL } from "@/lib/api/shopping-queries";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import ShoppingPage from "./page";
import { UNDO_DELETE_MS } from "./use-deferred-delete";

const flat = () => {
  const found = db.state.households.find(
    (candidate) => candidate.name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no Flat on Piękna");
  }
  return found;
};

const itemsOf = (householdId: string) =>
  db.state.shoppingItems.filter((item) => item.householdId === householdId);

function renderShopping() {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ShoppingPage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/shopping`,
      params: { householdId },
    }
  );
}

const list = () => screen.getByRole("list", { name: "Shopping list" });

const rowTexts = () =>
  within(list())
    .getAllByRole("listitem")
    .map((item) => item.textContent);

const row = (name: string) =>
  within(list())
    .queryAllByRole("listitem")
    .find((item) => item.textContent?.startsWith(name));

const ACTIONS = /^Actions for/u;

const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

Element.prototype.setPointerCapture ??= () => undefined;

afterEach(() => {
  vi.useRealTimers();
  toast.dismiss();
});

describe("ShoppingPage", () => {
  it("lists what's left newest first, with the amount and who added it", async () => {
    renderShopping();

    expect(await screen.findByText("Coffee beans")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "To buy · 3" })
    ).toBeInTheDocument();
    expect(rowTexts()).toEqual([
      "Coffee beans 500 gAdded by Bartek Kowalski",
      "BreadAdded by Celina Wiśniewska",
      "Milk 2 lAdded by Alice Nowak",
    ]);
    expect(screen.queryByText("Dish soap")).not.toBeInTheDocument();
    await expectNoAxeViolations(undefined, AXE_OPTIONS);
  });

  it("marks who added an item once they've left the household", async () => {
    const bartek = db.userByEmail("bartek@example.com");
    db.state.members = db.state.members.filter(
      (membership) =>
        !(
          membership.userId === bartek?.id &&
          membership.householdId === flat().id
        )
    );
    renderShopping();

    expect(
      await screen.findByText("Added by Bartek Kowalski (left)")
    ).toBeVisible();
  });

  it("adds items one after another from the keyboard", async () => {
    const { user } = renderShopping();
    const name = await screen.findByLabelText("Item");
    await screen.findByText("Coffee beans");

    await user.type(name, "Apples{Enter}");
    expect(name).toHaveFocus();
    expect(name).toHaveValue("");
    await user.type(name, "Flour");
    await user.tab();
    await user.keyboard("2");
    await user.tab();
    await user.keyboard("kg{Enter}");
    expect(name).toHaveFocus();
    expect(screen.getByLabelText("Quantity")).toHaveValue("");
    expect(screen.getByLabelText("Unit")).toHaveValue("");
    await user.type(name, "Eggs{Enter}");

    await waitFor(() =>
      expect(rowTexts().slice(0, 3)).toEqual([
        "EggsAdded by Alice Nowak",
        "Flour 2 kgAdded by Alice Nowak",
        "ApplesAdded by Alice Nowak",
      ])
    );
    expect(
      itemsOf(flat().id).map(({ name: item, quantity, unit }) => [
        item,
        quantity,
        unit,
      ])
    ).toEqual(
      expect.arrayContaining([
        ["Apples", 1, null],
        ["Flour", 2, "kg"],
        ["Eggs", 1, null],
      ])
    );
  });

  it("saves a unit that isn't one of the suggestions", async () => {
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");

    await user.type(screen.getByLabelText("Item"), "Wine");
    await user.type(screen.getByLabelText("Unit"), "bottle{Enter}");

    await waitFor(() => expect(row("Wine")).toHaveTextContent("1 bottle"));
    await waitFor(() => expect(row("Wine")).not.toHaveAttribute("aria-busy"));
    expect(itemsOf(flat().id).find((item) => item.name === "Wine")?.unit).toBe(
      "bottle"
    );
  });

  it("sends nothing for a blank name, and explains a quantity it can't save", async () => {
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");
    const before = itemsOf(flat().id).length;

    await user.type(screen.getByLabelText("Item"), "   {Enter}");
    expect(screen.queryByText("Enter a name.")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Item"), "Rice");
    await user.type(screen.getByLabelText("Quantity"), "1.5{Enter}");
    expect(await screen.findByText("Use a whole number.")).toBeVisible();
    expect(screen.getByLabelText("Item")).toHaveValue("   Rice");
    expect(itemsOf(flat().id)).toHaveLength(before);
  });

  it("offers to retry an item it couldn't add", async () => {
    server.use(
      http.post(
        "*/api/households/:householdId/shopping-items",
        () =>
          HttpResponse.json(
            { code: "MODULE_DISABLED", message: "Shopping is disabled" },
            { status: 403 }
          ),
        { once: true }
      )
    );
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");

    await user.type(screen.getByLabelText("Item"), "Butter{Enter}");

    expect(await screen.findByText("Couldn't add “Butter”")).toBeVisible();
    expect(row("Butter")).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(row("Butter")).toBeDefined());
    expect(itemsOf(flat().id).map((item) => item.name)).toContain("Butter");
  });

  it("edits an item from its menu", async () => {
    const { user } = renderShopping();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Milk" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit “Milk”" });

    await user.clear(within(dialog).getByLabelText("Quantity"));
    await user.type(within(dialog).getByLabelText("Quantity"), "3");
    await user.clear(within(dialog).getByLabelText("Unit"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(row("Milk")).toHaveTextContent("Milk ×3");
    const milk = itemsOf(flat().id).find((item) => item.name === "Milk");
    expect([milk?.quantity, milk?.unit]).toEqual([3, null]);
  });

  it("says so when the item was deleted while being edited", async () => {
    const { user } = renderShopping();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Milk" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit “Milk”" });
    db.state.shoppingItems = db.state.shoppingItems.filter(
      (item) => item.name !== "Milk"
    );

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText(
        "Someone deleted this item in the meantime."
      )
    ).toBeVisible();
    await expectNoAxeViolations(undefined, AXE_OPTIONS);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(row("Milk")).toBeUndefined());
  });

  it("deletes an item a few seconds after it goes from the list", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderShopping();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Bread" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(row("Bread")).toBeUndefined();
    expect(screen.getByRole("heading", { name: "To buy · 2" })).toBeVisible();
    expect(await screen.findByText("Deleted “Bread”")).toBeVisible();
    expect(itemsOf(flat().id).map((item) => item.name)).toContain("Bread");

    await act(() => vi.advanceTimersByTimeAsync(UNDO_DELETE_MS));

    await waitFor(() =>
      expect(itemsOf(flat().id).map((item) => item.name)).not.toContain("Bread")
    );
    expect(row("Bread")).toBeUndefined();
  });

  it("brings a deleted item back with Undo, as it was", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderShopping();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Bread" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_DELETE_MS));

    expect(row("Bread")).toHaveTextContent("Added by Celina Wiśniewska");
    expect(rowTexts()[1]).toBe("BreadAdded by Celina Wiśniewska");
    expect(itemsOf(flat().id).map((item) => item.name)).toContain("Bread");
  });

  it("keeps waiting while the pointer is on the toast, so Undo still works", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderShopping();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Bread" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.hover(await screen.findByText("Deleted “Bread”"));

    await act(() => vi.advanceTimersByTimeAsync(2 * UNDO_DELETE_MS));

    expect(itemsOf(flat().id).map((item) => item.name)).toContain("Bread");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(row("Bread")).toBeDefined());
    expect(itemsOf(flat().id).map((item) => item.name)).toContain("Bread");
  });

  it("sends a waiting delete when the user leaves the page", async () => {
    const { user, unmount } = renderShopping();
    await user.click(
      await screen.findByRole("button", { name: "Actions for Bread" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await screen.findByText("Deleted “Bread”");

    unmount();

    expect(toast.getToasts()).toHaveLength(0);
    await waitFor(() =>
      expect(itemsOf(flat().id).map((item) => item.name)).not.toContain("Bread")
    );
  });

  it("only shows the list while shopping is turned off", async () => {
    flat().features.shopping = false;
    renderShopping();

    expect(await screen.findByText("Coffee beans")).toBeVisible();
    expect(screen.queryByLabelText("Item")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ACTIONS })
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(undefined, AXE_OPTIONS);
  });

  it("shows what others add without a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderShopping();
    await screen.findByText("Coffee beans");
    const celina = db.userByEmail("celina@example.com");
    db.state.shoppingItems.push({
      id: crypto.randomUUID(),
      householdId: flat().id,
      name: "Tea",
      quantity: 1,
      unit: null,
      addedById: celina?.id ?? "",
      addedAt: new Date().toISOString(),
      purchasedAt: null,
      purchasedById: null,
    });

    await act(() => vi.advanceTimersByTimeAsync(SHOPPING_POLL_INTERVAL));

    await waitFor(() =>
      expect(rowTexts()[0]).toBe("TeaAdded by Celina Wiśniewska")
    );
  });
});
