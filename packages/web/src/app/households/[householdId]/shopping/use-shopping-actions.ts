"use client";

import type { ShoppingItem, UserSummary } from "@homesplit/contracts";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useHousehold } from "@/components/shell/household-context";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { optimistic } from "@/lib/api/queries";
import {
  shoppingActionKey,
  shoppingListQuery,
} from "@/lib/api/shopping-queries";
import { markPurchased, markUnpurchased } from "@/lib/shopping";

function failure(error: unknown, item: ShoppingItem, message: string): void {
  if (isApiRequestError(error) && error.status === 404) {
    toast.error(`Someone deleted “${item.name}” in the meantime.`);
    return;
  }
  toast.error(message, {
    description: errorMessage(error),
  });
}

function useToggle(
  endpoint: "purchaseShoppingItem" | "unpurchaseShoppingItem",
  update: (items: ShoppingItem[], item: ShoppingItem) => ShoppingItem[],
  message: (name: string) => string
) {
  const householdId = useHousehold().household.id;
  const mutationKey = shoppingActionKey(householdId);
  const callbacks = optimistic<ShoppingItem, ShoppingItem[]>({
    queryKey: () => shoppingListQuery(householdId).queryKey,
    update,
  });
  return useMutation({
    mutationKey,
    mutationFn: (item: ShoppingItem) =>
      api(endpoint, { params: { householdId, itemId: item.id } }),
    onMutate: callbacks.onMutate,
    onError: (error, item, result) => {
      callbacks.onError(error, item, result);
      failure(error, item, message(item.name));
    },
    // Only the last of several quick taps refetches: an earlier refetch would
    // bring back items whose requests are still on their way.
    onSettled: (data, error, item, result, context) =>
      context.client.isMutating({ mutationKey }) === 1
        ? callbacks.onSettled(data, error, item, result, context)
        : undefined,
  });
}

export function usePurchase() {
  const { members, userId } = useHousehold();
  const me = members.find((member) => member.userId === userId)?.user;
  const buyer: UserSummary = {
    id: userId,
    name: me?.name ?? "You",
    imageUrl: me?.image ?? null,
  };
  return useToggle(
    "purchaseShoppingItem",
    (items, item) =>
      markPurchased(items, item.id, buyer, new Date().toISOString()),
    (name) => `Couldn't mark “${name}” as bought.`
  );
}

export function useUnpurchase() {
  return useToggle(
    "unpurchaseShoppingItem",
    (items, item) => markUnpurchased(items, item.id),
    (name) => `Couldn't put “${name}” back on the list.`
  );
}
