"use client";

import type { Chore, UserSummary } from "@homesplit/contracts";
import { type QueryKey, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useHousehold } from "@/components/shell/household-context";
import { isApiRequestError } from "@/lib/api/api-error";
import { choreActionKey } from "@/lib/api/chore-queries";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate, optimistic } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { type ChorePages, placeChore } from "@/lib/chores";
import { UNDO_DELETE_MS } from "@/lib/use-deferred";

function useAction(
  listKey: QueryKey,
  endpoint: "completeChore" | "reopenChore",
  change: (chore: Chore) => Chore,
  message: (name: string) => string,
  onSuccess?: (chore: Chore) => void
) {
  const householdId = useHousehold().household.id;
  const mutationKey = choreActionKey(householdId);
  const callbacks = optimistic<Chore, ChorePages>({
    queryKey: () => listKey,
    update: (data, chore) => placeChore(data, change(chore)),
  });
  return useMutation({
    mutationKey,
    // Taps go out one at a time, in order, so an Undo lands after its complete.
    scope: { id: mutationKey.join("/") },
    mutationFn: (chore: Chore) =>
      api(endpoint, { params: { householdId, choreId: chore.id } }),
    onMutate: callbacks.onMutate,
    onSuccess: (_data, chore) => onSuccess?.(chore),
    onError: (error, chore, result) => {
      callbacks.onError(error, chore, result);
      if (isApiRequestError(error) && error.status === 404) {
        toast.error(`Someone deleted “${chore.name}” in the meantime.`);
        return;
      }
      toast.error(message(chore.name), { description: errorMessage(error) });
    },
    // Only the last of several quick taps refetches: an earlier refetch would
    // bring back chores whose requests are still on their way.
    onSettled: (_data, _error, _chore, _result, { client }) =>
      client.isMutating({ mutationKey }) === 1
        ? invalidate(client, [
            queryKeys.endpoint("listChores", { params: { householdId } }),
          ])
        : undefined,
  });
}

/** Complete and reopen for the list under `listKey`, the one on screen. */
export function useChoreActions(listKey: QueryKey) {
  const { members, userId } = useHousehold();
  const me = members.find((member) => member.userId === userId)?.user;
  const actor: UserSummary = {
    id: userId,
    name: me?.name ?? "You",
    imageUrl: me?.image ?? null,
  };

  const reopen = useAction(
    listKey,
    "reopenChore",
    (chore) => ({
      ...chore,
      isCompleted: false,
      completedAt: null,
      completedBy: null,
    }),
    (name) => `Couldn't reopen “${name}”.`
  );
  const complete = useAction(
    listKey,
    "completeChore",
    (chore) => ({
      ...chore,
      isCompleted: true,
      completedAt: new Date().toISOString(),
      completedBy: actor,
    }),
    (name) => `Couldn't complete “${name}”.`,
    (chore) =>
      toast(`Completed “${chore.name}”`, {
        duration: UNDO_DELETE_MS,
        action: { label: "Undo", onClick: () => reopen.mutate(chore) },
      })
  );

  return { complete: complete.mutate, reopen: reopen.mutate };
}
