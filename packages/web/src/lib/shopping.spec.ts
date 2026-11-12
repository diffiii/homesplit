import type { ShoppingItem, UserSummary } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_SHOPPING_ITEM_VALUES,
  formatQuantity,
  markPurchased,
  markUnpurchased,
  splitShoppingList,
  toShoppingItemRequest,
  validateShoppingItem,
} from "./shopping";

const values = (overrides = {}) => ({
  ...EMPTY_SHOPPING_ITEM_VALUES,
  name: "Milk",
  ...overrides,
});

describe("formatQuantity", () => {
  it("shows the unit, a count without one, and nothing for one of something", () => {
    expect(formatQuantity({ quantity: 2, unit: "l" })).toBe("2 l");
    expect(formatQuantity({ quantity: 1, unit: "pack" })).toBe("1 pack");
    expect(formatQuantity({ quantity: 10, unit: null })).toBe("×10");
    expect(formatQuantity({ quantity: 1, unit: null })).toBeNull();
  });
});

describe("toShoppingItemRequest", () => {
  it("trims, and reads a blank quantity as 1 and a blank unit as none", () => {
    expect(
      toShoppingItemRequest(values({ name: "  Milk ", unit: "  " }))
    ).toEqual({ name: "Milk", quantity: 1, unit: null });
    expect(
      toShoppingItemRequest(values({ quantity: " 500 ", unit: " bottle " }))
    ).toEqual({ name: "Milk", quantity: 500, unit: "bottle" });
  });
});

describe("validateShoppingItem", () => {
  it("accepts a blank quantity, and asks for a name only when told to", () => {
    expect(
      validateShoppingItem(values(), { requireName: true })
    ).toBeUndefined();
    expect(
      validateShoppingItem(values({ name: " " }), { requireName: false })
    ).toBeUndefined();
    expect(
      validateShoppingItem(values({ name: " " }), { requireName: true })
    ).toEqual({ fields: { name: "Enter a name." } });
  });

  it.each([
    ["0", "Enter 1 or more."],
    ["1.5", "Use a whole number."],
    ["-2", "Use a whole number."],
    ["two", "Use a whole number."],
    ["2147483648", "Enter a smaller number."],
  ])("rejects the quantity %s", (quantity, message) => {
    expect(
      validateShoppingItem(values({ quantity }), { requireName: true })
    ).toEqual({ fields: { quantity: message } });
  });

  it("accepts the largest quantity the API stores", () => {
    expect(
      validateShoppingItem(values({ quantity: "2147483647" }), {
        requireName: true,
      })
    ).toBeUndefined();
  });
});

const ALICE: UserSummary = { id: "a", name: "Alice", imageUrl: null };

function item(
  id: string,
  addedAt: string,
  purchasedAt: string | null = null
): ShoppingItem {
  const base = {
    id,
    householdId: "h",
    name: id,
    quantity: 1,
    unit: null,
    addedBy: ALICE,
    addedAt,
  };
  return purchasedAt
    ? { ...base, isPurchased: true, purchasedBy: ALICE, purchasedAt }
    : { ...base, isPurchased: false, purchasedBy: null, purchasedAt: null };
}

describe("splitShoppingList", () => {
  it("lists what's left newest first and what's bought by latest purchase", () => {
    const { toBuy, bought } = splitShoppingList([
      item("old", "2026-03-01T10:00:00.000Z"),
      item("new", "2026-03-02T10:00:00.000Z"),
      item(
        "bought-first",
        "2026-03-01T09:00:00.000Z",
        "2026-03-03T08:00:00.000Z"
      ),
      item(
        "bought-last",
        "2026-02-01T09:00:00.000Z",
        "2026-03-03T09:00:00.000Z"
      ),
    ]);
    expect(toBuy.map(({ id }) => id)).toEqual(["new", "old"]);
    expect(bought.map(({ id }) => id)).toEqual(["bought-last", "bought-first"]);
  });
});

describe("markPurchased and markUnpurchased", () => {
  const at = "2026-03-03T09:00:00.000Z";
  const list = [item("milk", at), item("bread", at)];

  it("buys and puts back only the item asked for", () => {
    const bought = markPurchased(list, "milk", ALICE, at);
    expect(bought[0]).toMatchObject({
      isPurchased: true,
      purchasedBy: ALICE,
      purchasedAt: at,
    });
    expect(bought[1]).toBe(list[1]);
    expect(markUnpurchased(bought, "milk")[0]).toEqual(list[0]);
  });

  it("keeps who bought it first, as the server does", () => {
    const bob = { ...ALICE, id: "b", name: "Bob" };
    const once = markPurchased(list, "milk", ALICE, at);
    expect(
      markPurchased(once, "milk", bob, "2026-03-04T00:00:00.000Z")[0]
    ).toBe(once[0]);
  });
});
