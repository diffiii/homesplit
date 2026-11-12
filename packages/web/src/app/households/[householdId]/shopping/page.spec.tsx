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
const BOUGHT = /^Bought \(\d+\)$/u;
const BREAD = /^Bread/u;
const EGGS = /^Eggs/u;
const MILK = /^Milk/u;
const COFFEE = /^Coffee beans/u;

const bought = () => screen.getByRole("region", { name: BOUGHT });

const boughtRow = (name: string) =>
  within(bought())
    .queryAllByRole("listitem")
    .find((item) => item.textContent?.startsWith(name));

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
      screen.getByRole("heading", { name: "To buy (3)" })
    ).toBeInTheDocument();
    expect(rowTexts()).toEqual([
      "Coffee beans 500 gAdded by Bartek Kowalski",
      "BreadAdded by Celina Wiśniewska",
      "Milk 2 lAdded by Alice Nowak",
    ]);
    expect(within(list()).queryByText("Dish soap")).not.toBeInTheDocument();
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

  it("adds several items from the sheet and says what went in", async () => {
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");

    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add items" });
    const name = within(dialog).getByLabelText("Item");
    await waitFor(() => expect(name).toHaveFocus());

    await user.type(name, "Apples{Enter}");
    expect(await within(dialog).findByText("Apples added")).toBeVisible();
    expect(name).toHaveFocus();
    await user.type(name, "Tea{Enter}");
    expect(await within(dialog).findByText("Tea added")).toBeVisible();
    expect(dialog).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(rowTexts().slice(0, 2)).toEqual([
      "TeaAdded by Alice Nowak",
      "ApplesAdded by Alice Nowak",
    ]);
    expect(screen.getByRole("button", { name: "Add item" })).toHaveFocus();
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
    expect(screen.getByRole("heading", { name: "To buy (2)" })).toBeVisible();
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

  it("buys an item with one tap and moves it to the bought section", async () => {
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");
    const alice = db.userByEmail("alice@example.com");

    await user.click(screen.getByRole("button", { name: BREAD }));

    expect(row("Bread")).toBeUndefined();
    expect(boughtRow("Bread")).toHaveTextContent(
      "BreadAlice Nowak bought it · just now"
    );
    expect(screen.getByRole("heading", { name: "To buy (2)" })).toBeVisible();
    await waitFor(() =>
      expect(
        itemsOf(flat().id).find((item) => item.name === "Bread")?.purchasedById
      ).toBe(alice?.id)
    );
    expect(
      within(bought()).getByRole("button", { name: BREAD })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await expectNoAxeViolations(undefined, AXE_OPTIONS);
  });

  it("puts a bought item back on the list when it's tapped", async () => {
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");

    await user.click(within(bought()).getByRole("button", { name: EGGS }));

    await waitFor(() => expect(row("Eggs")).toBeDefined());
    expect(row("Eggs")).toHaveTextContent("×10");
    expect(boughtRow("Eggs")).toBeUndefined();
    await waitFor(() =>
      expect(
        itemsOf(flat().id).find((item) => item.name === "Eggs")?.purchasedAt
      ).toBeNull()
    );
  });

  it("shows the latest purchase first", async () => {
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");

    await user.click(screen.getByRole("button", { name: COFFEE }));

    expect(within(bought()).getAllByRole("listitem")[0]).toHaveTextContent(
      "Coffee beans 500 gAlice Nowak bought it · just now"
    );
  });

  it("rolls a purchase back when the item is gone", async () => {
    server.use(
      http.post(
        "*/api/households/:householdId/shopping-items/:itemId/purchase",
        () =>
          HttpResponse.json(
            { code: "NOT_FOUND", message: "Shopping item not found" },
            { status: 404 }
          ),
        { once: true }
      )
    );
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");

    await user.click(screen.getByRole("button", { name: BREAD }));

    expect(
      await screen.findByText("Someone deleted “Bread” in the meantime.")
    ).toBeVisible();
    await waitFor(() => expect(row("Bread")).toBeDefined());
    expect(boughtRow("Bread")).toBeUndefined();
  });

  it("explains a purchase the server refused", async () => {
    server.use(
      http.post(
        "*/api/households/:householdId/shopping-items/:itemId/purchase",
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

    await user.click(screen.getByRole("button", { name: MILK }));

    expect(
      await screen.findByText("Couldn't mark “Milk” as bought.")
    ).toBeVisible();
    await waitFor(() => expect(row("Milk")).toBeDefined());
  });

  it("remembers whether the bought section is shown", async () => {
    const { user, unmount } = renderShopping();
    await screen.findByText("Dish soap");

    await user.click(screen.getByRole("button", { name: BOUGHT }));
    expect(screen.getByText("Dish soap")).not.toBeVisible();
    unmount();

    renderShopping();
    expect(await screen.findByRole("button", { name: BOUGHT })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByText("Dish soap")).not.toBeVisible();
    await expectNoAxeViolations(undefined, AXE_OPTIONS);
  });

  it("clears what's bought after the toast closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderShopping();
    await screen.findByText("Dish soap");

    await user.click(screen.getByRole("button", { name: "Clear bought" }));

    expect(screen.queryByRole("region", { name: BOUGHT })).toBeNull();
    expect(await screen.findByText("Cleared 2 items")).toBeVisible();
    expect(itemsOf(flat().id).filter((item) => item.purchasedAt)).toHaveLength(
      2
    );

    await act(() => vi.advanceTimersByTimeAsync(UNDO_DELETE_MS));

    await waitFor(() =>
      expect(
        itemsOf(flat().id).filter((item) => item.purchasedAt)
      ).toHaveLength(0)
    );
    expect(rowTexts()).toHaveLength(3);
  });

  it("brings cleared items back with Undo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderShopping();
    await screen.findByText("Dish soap");

    await user.click(screen.getByRole("button", { name: "Clear bought" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_DELETE_MS));

    expect(boughtRow("Dish soap")).toBeDefined();
    expect(itemsOf(flat().id).filter((item) => item.purchasedAt)).toHaveLength(
      2
    );
  });

  it("says how many went when the server cleared a different number", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderShopping();
    await screen.findByText("Dish soap");

    await user.click(screen.getByRole("button", { name: "Clear bought" }));
    const bread = db.state.shoppingItems.find((item) => item.name === "Bread");
    if (bread) {
      bread.purchasedAt = new Date().toISOString();
      bread.purchasedById = bread.addedById;
    }
    await act(() => vi.advanceTimersByTimeAsync(UNDO_DELETE_MS));

    expect(await screen.findByText("Cleared 3 items")).toBeVisible();
  });

  it("waits with polling while a purchase is on its way", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    let lists = 0;
    server.use(
      http.get("*/api/households/:householdId/shopping-items", () => {
        lists += 1;
      }),
      http.post(
        "*/api/households/:householdId/shopping-items/:itemId/purchase",
        async () => {
          await held;
        },
        { once: true }
      )
    );
    const { user } = renderShopping();
    await screen.findByText("Coffee beans");
    await user.click(screen.getByRole("button", { name: BREAD }));
    const before = lists;

    await act(() => vi.advanceTimersByTimeAsync(3 * SHOPPING_POLL_INTERVAL));

    expect(lists).toBe(before);
    expect(boughtRow("Bread")).toBeDefined();
    release();
    await waitFor(() => expect(lists).toBeGreaterThan(before));
  });

  it("only shows the list while shopping is turned off", async () => {
    flat().features.shopping = false;
    renderShopping();

    expect(await screen.findByText("Coffee beans")).toBeVisible();
    expect(screen.queryByLabelText("Item")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: ACTIONS })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COFFEE })).toBeNull();
    expect(screen.queryByText("Click or tap", { exact: false })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear bought" })).toBeNull();
    expect(within(bought()).getByText("Dish soap")).toBeVisible();
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
