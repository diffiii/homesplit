"use client";

import type { Chore } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useHouseholdId } from "@/components/shell/household-context";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { useDeferred } from "@/lib/use-deferred";

export function useDeleteChore() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const { hidden, show, defer } = useDeferred();

  const remove = useMutation({
    mutationFn: async (chore: Chore) => {
      try {
        await api("deleteChore", {
          params: { householdId, choreId: chore.id },
        });
      } catch (error) {
        if (!(isApiRequestError(error) && error.status === 404)) {
          throw error;
        }
      }
    },
    onError: (error, chore) => {
      toast.error(`Couldn't delete “${chore.name}”.`, {
        description: errorMessage(error),
      });
    },
    onSettled: async (_data, _error, chore) => {
      await invalidate(queryClient, [
        queryKeys.endpoint("listChores", { params: { householdId } }),
      ]);
      show([chore.id]);
    },
  });

  const deleteChore = (chore: Chore) =>
    defer(chore.id, [chore.id], `Deleted “${chore.name}”`, () =>
      remove.mutate(chore)
    );

  return { hidden, deleteChore };
}
