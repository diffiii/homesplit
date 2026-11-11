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

export function useDeferredDelete() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const waiting = useRef(new Map<string, () => void>());

  const show = (id: string) =>
    setHidden((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });

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
      show(item.id);
      toast.error(`Couldn't delete “${item.name}”.`, {
        description: errorMessage(error),
      });
    },
    onSettled: () =>
      invalidate(queryClient, [
        queryKeys.endpoint("listShoppingItems", { params: { householdId } }),
      ]),
  });
  const { mutate } = remove;

  useEffect(() => {
    const pending = waiting.current;
    return () => {
      for (const send of pending.values()) {
        send();
      }
    };
  }, []);

  const deleteItem = (item: ShoppingItem) => {
    setHidden((previous) => new Set(previous).add(item.id));
    const send = () => {
      if (waiting.current.delete(item.id)) {
        toast.dismiss(toastId);
        mutate(item);
      }
    };
    waiting.current.set(item.id, send);
    const toastId = toast(`Deleted “${item.name}”`, {
      duration: UNDO_DELETE_MS,
      onAutoClose: send,
      onDismiss: send,
      action: {
        label: "Undo",
        onClick: () => {
          waiting.current.delete(item.id);
          show(item.id);
        },
      },
    });
  };

  return { hidden, deleteItem };
}
