import { MAX_AMOUNT_CENTS, MAX_RECEIPT_ITEMS } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import {
  fractionDigits,
  type ModelReceipt,
  toMinorUnits,
  toReceiptDraft,
} from "./receipt-draft";

const reply = (overrides: Partial<ModelReceipt> = {}): ModelReceipt => ({
  isReceipt: true,
  merchant: "Biedronka",
  purchasedOn: "2026-11-02",
  currency: "PLN",
  total: 12.99,
  receiptDiscount: null,
  items: [
    {
      name: "Milk",
      quantity: 1,
      unitPrice: 12.99,
      discount: null,
      total: 12.99,
    },
  ],
  ...overrides,
});

describe("fractionDigits", () => {
  it("uses the ISO 4217 exponent, and 2 while the currency is unknown", () => {
    expect(fractionDigits("PLN")).toBe(2);
    expect(fractionDigits("JPY")).toBe(0);
    expect(fractionDigits("KWD")).toBe(3);
    expect(fractionDigits(null)).toBe(2);
  });
});

describe("toMinorUnits", () => {
  it("rounds away the binary noise of decimal amounts", () => {
    expect(toMinorUnits(12.99, 2)).toBe(1299);
    expect(toMinorUnits(1.005, 2)).toBe(101);
    expect(toMinorUnits(0.1 + 0.2, 2)).toBe(30);
    expect(toMinorUnits(1999, 0)).toBe(1999);
    expect(toMinorUnits(1.999, 3)).toBe(1999);
  });

  it("rounds half away from zero, keeping the sign", () => {
    expect(toMinorUnits(-0.5, 2)).toBe(-50);
    expect(toMinorUnits(-1.555, 2)).toBe(-156);
    expect(toMinorUnits(-0.001, 2)).toBe(0);
  });
});

describe("toReceiptDraft", () => {
  it("converts the reply to minor units", () => {
    expect(
      toReceiptDraft(
        reply({
          total: 17.5,
          receiptDiscount: 1,
          items: [
            {
              name: " Apples ",
              quantity: 0.4524,
              unitPrice: 7.99,
              discount: -0.5,
              total: 3.11,
            },
            {
              name: "Bread",
              quantity: null,
              unitPrice: null,
              discount: null,
              total: 15.39,
            },
          ],
        })
      )
    ).toEqual({
      merchant: "Biedronka",
      purchasedOn: "2026-11-02",
      currency: "PLN",
      totalCents: 1750,
      discountCents: 100,
      items: [
        {
          name: "Apples",
          quantity: 0.452,
          unitPriceCents: 799,
          discountCents: 50,
          totalCents: 311,
        },
        {
          name: "Bread",
          quantity: 1,
          unitPriceCents: 1539,
          discountCents: 0,
          totalCents: 1539,
        },
      ],
    });
  });

  it("uses the currency's exponent", () => {
    const draft = toReceiptDraft(
      reply({
        currency: "jpy",
        total: 540,
        items: [
          {
            name: "Onigiri",
            quantity: 2,
            unitPrice: 270,
            discount: 0,
            total: 540,
          },
        ],
      })
    );
    expect(draft).toMatchObject({ currency: "JPY", totalCents: 540 });
    expect(draft.items[0]).toMatchObject({ unitPriceCents: 270 });
  });

  it("drops header fields it can't read", () => {
    expect(
      toReceiptDraft(
        reply({
          merchant: "   ",
          purchasedOn: "02.11.2026",
          currency: "zł",
          total: null,
        })
      )
    ).toMatchObject({
      merchant: null,
      purchasedOn: null,
      currency: null,
      totalCents: null,
    });
  });

  it("fails a file the model says isn't a receipt", () => {
    expect(() => toReceiptDraft(reply({ isReceipt: false }))).toThrow(
      "The attachment isn't a receipt"
    );
  });

  it.each([
    ["a total past the limit", { total: MAX_AMOUNT_CENTS }],
    ["a negative total", { total: -1 }],
    [
      "an item without a name",
      {
        items: [
          { name: " ", quantity: 1, unitPrice: 1, discount: null, total: 1 },
        ],
      },
    ],
    [
      "a zero quantity",
      {
        items: [
          { name: "Milk", quantity: 0, unitPrice: 1, discount: null, total: 1 },
        ],
      },
    ],
    [
      "too many items",
      {
        items: Array.from({ length: MAX_RECEIPT_ITEMS + 1 }, () => ({
          name: "Milk",
          quantity: 1,
          unitPrice: 1,
          discount: null,
          total: 1,
        })),
      },
    ],
  ])("fails as invalid output for %s", (_case, overrides) => {
    expect(() => toReceiptDraft(reply(overrides))).toThrow(
      "AI provider returned invalid output"
    );
  });
});
