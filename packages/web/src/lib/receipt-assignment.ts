import type {
  AssignReceiptItemsRequest,
  ConfirmReceiptRequest,
  Receipt,
  ReceiptItem,
  ReceiptSplit,
  UserSummary,
} from "@homesplit/contracts";
import type { ServerErrors } from "./form";

/** One item's new assignees, as `assignReceiptItems` takes them. */
export type ItemAssignees =
  AssignReceiptItemsRequest["items"][number]["assignees"];

/**
 * Whether an item is counted in units, so each person can have some of them
 * (2 of 3 beers): a whole quantity above 1. Weighed items, such as 0.452 kg
 * of apples, are only split in shares.
 */
export function countsUnits({ quantity }: Pick<ReceiptItem, "quantity">) {
  return Number.isInteger(quantity) && quantity > 1;
}

/** The units given out on an item, the sum of its shares. */
export function assignedUnits({
  assignments,
}: Pick<ReceiptItem, "assignments">): number {
  return assignments.reduce((sum, { shares }) => sum + shares, 0);
}

const toInput = ({ assignments }: Pick<ReceiptItem, "assignments">) =>
  assignments.map(({ user, shares }) => ({ userId: user.id, shares }));

/**
 * The item's assignees after tapping `userId`: taken off when they had it,
 * otherwise added with one share, an equal part or one unit.
 */
export function toggleAssignee(
  item: Pick<ReceiptItem, "assignments">,
  userId: string
): ItemAssignees {
  const current = toInput(item);
  return current.some((assignee) => assignee.userId === userId)
    ? current.filter((assignee) => assignee.userId !== userId)
    : [...current, { userId, shares: 1 }];
}

/** The item's assignees with `userId` having `units` of it. */
export function setUnits(
  item: Pick<ReceiptItem, "assignments">,
  userId: string,
  units: number
): ItemAssignees {
  return toInput(item).map((assignee) =>
    assignee.userId === userId ? { userId, shares: units } : assignee
  );
}

/** One share each, which splits an item equally. */
export function equalAssignees(userIds: readonly string[]): ItemAssignees {
  return userIds.map((userId) => ({ userId, shares: 1 }));
}

/**
 * The receipt as it will be once `request` is saved, for showing a tap
 * straight away. Assignments stay ordered by user ID, as the API orders
 * them; `people` names the users the request adds.
 */
export function withAssignments(
  receipt: Receipt,
  { items }: AssignReceiptItemsRequest,
  people: ReadonlyMap<string, UserSummary>
): Receipt {
  const changes = new Map(
    items.map(({ itemId, assignees }) => [itemId, assignees])
  );
  return {
    ...receipt,
    items: receipt.items.map((item) => {
      const assignees = changes.get(item.id);
      if (!assignees) {
        return item;
      }
      const known = new Map(
        item.assignments.map(({ user }) => [user.id, user])
      );
      return {
        ...item,
        assignments: assignees
          .map(({ userId, shares }) => ({
            user: known.get(userId) ??
              people.get(userId) ?? {
                id: userId,
                name: "Someone",
                imageUrl: null,
              },
            shares,
          }))
          .sort((a, b) => (a.user.id < b.user.id ? -1 : 1)),
      };
    }),
  };
}

/** Whether the split can become an expense, and if not, what's in the way. */
export type ConfirmReadiness =
  | { ok: true }
  | {
      ok: false;
      reason: "incomplete" | "mismatch" | "no-items" | "unassigned";
      text: string;
    };

export function confirmReadiness(
  receipt: Pick<Receipt, "currency" | "items" | "totalCents">,
  split: Pick<ReceiptSplit, "differenceCents" | "unassignedItemIds">
): ConfirmReadiness {
  if (receipt.items.length === 0) {
    return {
      ok: false,
      reason: "no-items",
      text: "Add the receipt's items to split it.",
    };
  }
  if (receipt.currency === null || receipt.totalCents === null) {
    return {
      ok: false,
      reason: "incomplete",
      text: "Enter the receipt's currency and total under Edit items.",
    };
  }
  if (split.differenceCents !== 0) {
    return {
      ok: false,
      reason: "mismatch",
      text: "Fix the items under Edit items so they add up to the total.",
    };
  }
  const unassigned = split.unassignedItemIds.length;
  if (unassigned > 0) {
    return {
      ok: false,
      reason: "unassigned",
      text:
        unassigned === 1
          ? "Assign the last item to someone."
          : `Assign the ${unassigned} remaining items to someone.`,
    };
  }
  return { ok: true };
}

/** The expense fields as the confirm form edits them. */
export interface ConfirmReceiptValues {
  categoryId: string | null;
  expenseDate: string;
  name: string;
  payerId: string;
}

/**
 * What confirming defaults to, as the API does: the payer is who scanned the
 * receipt, or the user once they've left, the name and date are the
 * receipt's, and the category is the scan's suggestion only when it's
 * confident.
 */
export function confirmDefaults(
  receipt: Pick<
    Receipt,
    "createdBy" | "merchant" | "purchasedOn" | "suggestedCategory"
  >,
  {
    memberIds,
    today,
    userId,
  }: { memberIds: ReadonlySet<string>; today: string; userId: string }
): ConfirmReceiptValues {
  const { suggestedCategory } = receipt;
  return {
    payerId: memberIds.has(receipt.createdBy.id)
      ? receipt.createdBy.id
      : userId,
    name: receipt.merchant ?? "",
    expenseDate: receipt.purchasedOn ?? today,
    categoryId:
      suggestedCategory?.confidence === "high"
        ? suggestedCategory.categoryId
        : null,
  };
}

export function validateConfirm(
  values: ConfirmReceiptValues
): ServerErrors | undefined {
  const fields: Record<string, string> = {};
  if (!values.name.trim()) {
    fields.name = "Enter a name.";
  }
  if (!values.expenseDate) {
    fields.expenseDate = "Pick a date.";
  }
  if (!values.payerId) {
    fields.payerId = "Pick who paid.";
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

export function toConfirmReceiptRequest(
  values: ConfirmReceiptValues
): ConfirmReceiptRequest {
  return {
    payerId: values.payerId,
    name: values.name.trim(),
    expenseDate: values.expenseDate,
    categoryId: values.categoryId,
  };
}
