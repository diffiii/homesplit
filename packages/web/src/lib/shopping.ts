import {
  CreateShoppingItemRequest,
  type ShoppingItem,
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
    return "Enter a whole number, like 2.";
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

export function toShoppingItemRequest(values: ShoppingItemFormValues): {
  name: string;
  quantity: number;
  unit: string | null;
} {
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
