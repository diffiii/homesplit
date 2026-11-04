import { describe, expect, it } from "vitest";
import {
  EMPTY_SHOPPING_ITEM_VALUES,
  formatQuantity,
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
    ["1.5", "Enter a whole number, like 2."],
    ["-2", "Enter a whole number, like 2."],
    ["two", "Enter a whole number, like 2."],
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
