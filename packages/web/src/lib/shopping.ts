import {
  CreateShoppingItemRequest,
  type IsoDateTime,
  type PurchasedShoppingItem,
  type ShoppingItem,
  type UnpurchasedShoppingItem,
  type UserSummary,
} from "@homesplit/contracts";
import type { ServerErrors } from "./form";

export const UNIT_SUGGESTIONS = ["pcs", "kg", "g", "l", "ml", "pack"] as const;

export interface ShoppingItemFormValues {
  name: string;
  quantity: string;
  unit: string;
}

export const EMPTY_SHOPPING_ITEM_VALUES: ShoppingItemFormValues = {
  name: "",
  quantity: "",
  unit: "",
};

export function shoppingItemValues(
  item: Pick<ShoppingItem, "name" | "quantity" | "unit">
): ShoppingItemFormValues {
  return {
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit ?? "",
  };
}

const WHOLE_NUMBER = /^\d+$/u;

function quantityError(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return;
  }
  if (!WHOLE_NUMBER.test(trimmed)) {
    return "Use a whole number.";
  }
  const quantity = Number(trimmed);
  if (quantity < 1) {
    return "Enter 1 or more.";
  }
  if (!CreateShoppingItemRequest.shape.quantity.safeParse(quantity).success) {
    return "Enter a smaller number.";
  }
}

export function validateShoppingItem(
  values: ShoppingItemFormValues,
  { requireName }: { requireName: boolean }
): ServerErrors | undefined {
  const fields: Record<string, string> = {};
  if (requireName && !values.name.trim()) {
    fields.name = "Enter a name.";
  }
  const quantity = quantityError(values.quantity);
  if (quantity) {
    fields.quantity = quantity;
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

export type ShoppingItemBody = Required<CreateShoppingItemRequest>;

export function toShoppingItemRequest(
  values: ShoppingItemFormValues
): ShoppingItemBody {
  const quantity = values.quantity.trim();
  return {
    name: values.name.trim(),
    quantity: quantity ? Number(quantity) : 1,
    unit: values.unit.trim() || null,
  };
}

export function formatQuantity({
  quantity,
  unit,
}: Pick<ShoppingItem, "quantity" | "unit">): string | null {
  if (unit) {
    return `${quantity} ${unit}`;
  }
  return quantity > 1 ? `×${quantity}` : null;
}

export interface SplitShoppingList {
  bought: PurchasedShoppingItem[];
  toBuy: UnpurchasedShoppingItem[];
}

const newestFirst = (a: string, b: string) => {
  if (a === b) {
    return 0;
  }
  return a < b ? 1 : -1;
};

export function splitShoppingList(
  items: readonly ShoppingItem[]
): SplitShoppingList {
  const toBuy: UnpurchasedShoppingItem[] = [];
  const bought: PurchasedShoppingItem[] = [];
  for (const item of items) {
    if (item.isPurchased) {
      bought.push(item);
    } else {
      toBuy.push(item);
    }
  }
  toBuy.sort(
    (a, b) => newestFirst(a.addedAt, b.addedAt) || newestFirst(a.id, b.id)
  );
  bought.sort(
    (a, b) =>
      newestFirst(a.purchasedAt, b.purchasedAt) || newestFirst(a.id, b.id)
  );
  return { toBuy, bought };
}

export function markPurchased(
  items: readonly ShoppingItem[],
  id: string,
  buyer: UserSummary,
  at: IsoDateTime
): ShoppingItem[] {
  return items.map((item) =>
    item.id === id && !item.isPurchased
      ? { ...item, isPurchased: true, purchasedBy: buyer, purchasedAt: at }
      : item
  );
}

export function markUnpurchased(
  items: readonly ShoppingItem[],
  id: string
): ShoppingItem[] {
  return items.map((item) =>
    item.id === id && item.isPurchased
      ? { ...item, isPurchased: false, purchasedBy: null, purchasedAt: null }
      : item
  );
}
