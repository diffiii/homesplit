"use client";

import type { ShoppingItem } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useHouseholdId } from "@/components/shell/household-context";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";

export const UNDO_DELETE_MS = 5000;

const CLEAR_KEY = "clear-bought";

const clearedMessage = (count: number) =>
  `Cleared ${count} ${count === 1 ? "item" : "items"}`;

export function useDeferredDelete() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const waiting = useRef(new Map<string, () => void>());

  const show = (ids: readonly string[]) =>
    setHidden((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        next.delete(id);
      }
      return next;
    });

  const settle = async (ids: readonly string[]) => {
    await invalidate(queryClient, [
      queryKeys.endpoint("listShoppingItems", { params: { householdId } }),
    ]);
    show(ids);
  };

  const remove = useMutation({
    mutationFn: async (item: ShoppingItem) => {
      try {
        await api("deleteShoppingItem", {
          params: { householdId, itemId: item.id },
        });
      } catch (error) {
        if (!(isApiRequestError(error) && error.status === 404)) {
          throw error;
        }
      }
    },
    onError: (error, item) => {
      toast.error(`Couldn't delete “${item.name}”.`, {
        description: errorMessage(error),
      });
    },
    onSettled: (_data, _error, item) => settle([item.id]),
  });

  const clear = useMutation({
    mutationFn: (_ids: readonly string[]) =>
      api("clearPurchasedShoppingItems", { params: { householdId } }),
    onSuccess: ({ deletedCount }, ids) => {
      if (deletedCount !== ids.length) {
        toast(clearedMessage(deletedCount));
      }
    },
    onError: (error) => {
      toast.error("Couldn't clear the bought items.", {
        description: errorMessage(error),
      });
    },
    onSettled: (_data, _error, ids) => settle(ids),
  });

  useEffect(() => {
    const pending = waiting.current;
    return () => {
      for (const send of pending.values()) {
        send();
      }
    };
  }, []);

  const defer = (
    key: string,
    ids: readonly string[],
    message: string,
    request: () => void
  ) => {
    setHidden((previous) => new Set([...previous, ...ids]));
    const send = () => {
      if (waiting.current.delete(key)) {
        toast.dismiss(toastId);
        request();
      }
    };
    waiting.current.set(key, send);
    const toastId = toast(message, {
      duration: UNDO_DELETE_MS,
      onAutoClose: send,
      onDismiss: send,
      action: {
        label: "Undo",
        onClick: () => {
          waiting.current.delete(key);
          show(ids);
        },
      },
    });
  };

  const deleteItem = (item: ShoppingItem) =>
    defer(item.id, [item.id], `Deleted “${item.name}”`, () =>
      remove.mutate(item)
    );

  const clearBought = (items: readonly ShoppingItem[]) => {
    waiting.current.get(CLEAR_KEY)?.();
    const ids = items.map((item) => item.id);
    defer(CLEAR_KEY, ids, clearedMessage(ids.length), () => clear.mutate(ids));
  };

  return { hidden, deleteItem, clearBought };
}
