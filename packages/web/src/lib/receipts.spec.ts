import type { Receipt } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import {
  differenceText,
  draftTotals,
  failureMessage,
  lineTotal,
  newItemValues,
  type ReceiptDraftValues,
  receiptDraftValues,
  receiptPollDelay,
  toUpdateReceiptRequest,
  validateReceiptDraft,
} from "./receipts";

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Alice",
  imageUrl: null,
};

const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  householdId: "00000000-0000-4000-8000-0000000000bb",
  attachmentId: "00000000-0000-4000-8000-0000000000cc",
  status: "ready",
  failureCode: null,
  merchant: "Biedronka",
  purchasedOn: "2026-11-02",
  currency: "PLN",
  totalCents: 1360,
  discountCents: 50,
  createdBy: USER,
  createdAt: "2026-11-02T10:00:00.000Z",
  updatedAt: "2026-11-02T10:00:10.000Z",
  items: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      position: 0,
      name: "Apples",
      quantity: 0.452,
      unitPriceCents: 689,
      discountCents: 0,
      totalCents: 311,
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      position: 1,
      name: "Bread",
      quantity: 2,
      unitPriceCents: 350,
      discountCents: 100,
      totalCents: 600,
    },
  ],
  itemsTotalCents: 911,
  differenceCents: -499,
  ...overrides,
});

const item = (
  overrides: Partial<ReceiptDraftValues["items"][number]> = {}
) => ({
  ...newItemValues(),
  name: "Milk",
  quantity: "1",
  unitPrice: "4.99",
  total: "4.99",
  ...overrides,
});

const values = (overrides: Partial<ReceiptDraftValues> = {}) => ({
  merchant: "Biedronka",
  purchasedOn: "2026-11-02",
  currency: "PLN",
  total: "4.99",
  discount: "",
  items: [item()],
  ...overrides,
});

describe("receiptPollDelay", () => {
  it("waits longer each time, up to a limit", () => {
    expect([1, 2, 3, 4, 5, 6].map(receiptPollDelay)).toEqual([
      1000, 1500, 2250, 3375, 5000, 5000,
    ]);
  });
});

describe("failureMessage", () => {
  it("explains a code, and falls back for none", () => {
    expect(failureMessage("NOT_A_RECEIPT")).toBe(
      "This doesn't look like a receipt."
    );
    expect(failureMessage(null)).toBe(
      "Something went wrong while reading the receipt."
    );
  });
});

describe("receiptDraftValues", () => {
  it("shows amounts in the currency's units, leaving zero discounts blank", () => {
    expect(receiptDraftValues(receipt())).toEqual({
      merchant: "Biedronka",
      purchasedOn: "2026-11-02",
      currency: "PLN",
      total: "13.60",
      discount: "0.50",
      items: [
        {
          key: "00000000-0000-4000-8000-000000000011",
          id: "00000000-0000-4000-8000-000000000011",
          name: "Apples",
          quantity: "0.452",
          unitPrice: "6.89",
          discount: "",
          total: "3.11",
        },
        {
          key: "00000000-0000-4000-8000-000000000012",
          id: "00000000-0000-4000-8000-000000000012",
          name: "Bread",
          quantity: "2",
          unitPrice: "3.50",
          discount: "1.00",
          total: "6.00",
        },
      ],
    });
  });

  it("leaves what wasn't read blank", () => {
    expect(
      receiptDraftValues(
        receipt({
          merchant: null,
          purchasedOn: null,
          currency: null,
          totalCents: null,
          discountCents: 0,
          items: [],
        })
      )
    ).toMatchObject({
      merchant: "",
      purchasedOn: "",
      currency: "",
      total: "",
      discount: "",
      items: [],
    });
  });
});

describe("toUpdateReceiptRequest", () => {
  it("sends every field, keeping item IDs and leaving them out for new items", () => {
    const draft = receiptDraftValues(receipt());
    const added = item({ name: " Butter ", unitPrice: "7", total: "7,00" });
    expect(
      toUpdateReceiptRequest({ ...draft, items: [...draft.items, added] })
    ).toEqual({
      merchant: "Biedronka",
      purchasedOn: "2026-11-02",
      currency: "PLN",
      totalCents: 1360,
      discountCents: 50,
      items: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          name: "Apples",
          quantity: 0.452,
          unitPriceCents: 689,
          discountCents: 0,
          totalCents: 311,
        },
        {
          id: "00000000-0000-4000-8000-000000000012",
          name: "Bread",
          quantity: 2,
          unitPriceCents: 350,
          discountCents: 100,
          totalCents: 600,
        },
        {
          name: "Butter",
          quantity: 1,
          unitPriceCents: 700,
          discountCents: 0,
          totalCents: 700,
        },
      ],
    });
  });

  it("sends blanks as null, and amounts in the currency's units", () => {
    expect(
      toUpdateReceiptRequest(
        values({ merchant: " ", purchasedOn: "", total: "", currency: "JPY" })
      )
    ).toMatchObject({
      merchant: null,
      purchasedOn: null,
      totalCents: null,
      currency: "JPY",
    });
  });
});

describe("validateReceiptDraft", () => {
  it("accepts a draft without a shop, date, total, or currency", () => {
    expect(
      validateReceiptDraft(
        values({ merchant: "", purchasedOn: "", total: "", currency: "" })
      )
    ).toBeUndefined();
  });

  it("rejects negative amounts, since a deposit goes in the receipt discount", () => {
    expect(
      validateReceiptDraft(
        values({ items: [item({ unitPrice: "-0.50", total: "-0.50" })] })
      )?.fields
    ).toEqual({
      "items[0].unitPrice": "Enter a number, like 12.50.",
      "items[0].total": "Enter a number, like 12.50.",
    });
  });

  it("checks each item's name, quantity, and amounts", () => {
    expect(
      validateReceiptDraft(
        values({
          total: "1.999",
          items: [
            item({ name: " ", quantity: "0", unitPrice: "", total: "" }),
            item({ quantity: "0.4521", discount: "x" }),
          ],
        })
      )?.fields
    ).toEqual({
      total: "Use at most 2 decimals.",
      "items[0].name": "Enter a name.",
      "items[0].quantity": "Enter more than 0.",
      "items[0].unitPrice": "Enter an amount.",
      "items[0].total": "Enter an amount.",
      "items[1].quantity": "Use at most 3 decimals.",
      "items[1].discount": "Enter a number, like 12.50.",
    });
  });
});

describe("lineTotal", () => {
  it("multiplies, rounds half up, and takes off the discount", () => {
    expect(
      lineTotal({ quantity: "0.452", unitPrice: "6.89", discount: "" }, "PLN")
    ).toBe("3.11");
    expect(
      lineTotal({ quantity: "2", unitPrice: "3.50", discount: "1" }, "PLN")
    ).toBe("6.00");
    expect(
      lineTotal({ quantity: "3", unitPrice: "270", discount: "" }, "JPY")
    ).toBe("810");
  });

  it("gives nothing while a part is missing or the discount is larger", () => {
    expect(
      lineTotal({ quantity: "1", unitPrice: "", discount: "" }, "PLN")
    ).toBeNull();
    expect(
      lineTotal({ quantity: "1", unitPrice: "2", discount: "3" }, "PLN")
    ).toBeNull();
  });
});

describe("draftTotals and differenceText", () => {
  it("compares the items, less the receipt discount, with the total", () => {
    const totals = draftTotals(
      values({
        total: "10.00",
        discount: "1.00",
        items: [item({ total: "6.00" }), item({ total: "5.50" })],
      })
    );
    expect(totals).toEqual({
      itemsCents: 1150,
      discountCents: 100,
      totalCents: 1000,
      invalidItems: 0,
      differenceCents: 50,
    });
    expect(differenceText(totals.differenceCents, "PLN")).toBe(
      `The items come to ${formatMoney({ amountCents: 50, currency: "PLN" })} more than the total.`
    );
  });

  it("counts items with an invalid total apart, and has no difference without a total", () => {
    const totals = draftTotals(
      values({ total: "", items: [item({ total: "abc" }), item()] })
    );
    expect(totals).toMatchObject({
      itemsCents: 499,
      invalidItems: 1,
      differenceCents: null,
    });
    expect(differenceText(null, "PLN")).toBe(
      "Enter the receipt's total to check the items against it."
    );
    expect(differenceText(0, "PLN")).toBe("The items add up to the total.");
    expect(differenceText(-120, null)).toBe(
      "The items come to 1.20 less than the total."
    );
  });
});
