"use client";

import type {
  AssignReceiptItemsRequest,
  Receipt,
  UserSummary,
} from "@homesplit/contracts";
import { useMutation } from "@tanstack/react-query";
import { PencilIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/components/shell/household-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { optimistic } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import {
  receiptAssignKey,
  receiptQuery,
  receiptSplitQuery,
} from "@/lib/api/receipt-queries";
import { equalAssignees, withAssignments } from "@/lib/receipt-assignment";
import { useMemberSummaries } from "../../expense-form";
import { AssignItem } from "./receipt-assign-item";
import { ConfirmForm } from "./receipt-confirm-form";
import { SelectionBar } from "./receipt-selection-bar";

/** Saves who had which items, showing it at once and sending taps one at a time. */
function useAssignItems(
  receipt: Receipt,
  people: ReadonlyMap<string, UserSummary>
) {
  const { household } = useHousehold();
  const householdId = household.id;
  const mutationKey = receiptAssignKey(householdId, receipt.id);
  const callbacks = optimistic<AssignReceiptItemsRequest, Receipt>({
    queryKey: () => receiptQuery(householdId, receipt.id).queryKey,
    update: (current, body) => withAssignments(current, body, people),
    invalidates: () => [receiptSplitQuery(householdId, receipt.id).queryKey],
  });
  return useMutation({
    mutationKey,
    // In order, so the last tap is what the server keeps.
    scope: { id: mutationKey.join("/") },
    mutationFn: (body: AssignReceiptItemsRequest) =>
      api("assignReceiptItems", {
        params: { householdId, receiptId: receipt.id },
        body,
      }),
    onMutate: callbacks.onMutate,
    onError: (error, body, result, context) => {
      callbacks.onError(error, body, result);
      toast.error("Couldn't save who had what.", {
        description: errorMessage(error),
      });
      if (isApiRequestError(error) && error.code === "INVALID_REFERENCE") {
        // Someone left: show the household as it is now.
        context.client.invalidateQueries({
          queryKey: queryKeys.householdAuth(householdId, "get"),
        });
      }
    },
    // Only the last of several quick taps refetches, so an earlier answer
    // can't undo the taps still on their way.
    onSettled: (data, error, body, result, context) =>
      context.client.isMutating({ mutationKey }) === 1
        ? callbacks.onSettled(data, error, body, result, context)
        : undefined,
  });
}

interface AssignmentProps {
  /** Opens the item editor, where the items and the total are fixed. */
  onEditItems: () => void;
  receipt: Receipt;
  /** The item editor has changes that aren't saved, which this view doesn't show yet. */
  unsavedEdits: boolean;
}

/**
 * Who had which item, and the expense it all becomes. Each tap is saved
 * straight away; the summary shows each person's part from the API's
 * preview, and adding the expense waits until every item is assigned and
 * the items add up to the total.
 */
export function ReceiptAssignment({
  receipt,
  onEditItems,
  unsavedEdits,
}: AssignmentProps) {
  const members = useMemberSummaries();
  const people = useMemo(() => {
    const map = new Map(members.map((user) => [user.id, user]));
    for (const { assignments } of receipt.items) {
      for (const { user } of assignments) {
        if (!map.has(user.id)) {
          map.set(user.id, user);
        }
      }
    }
    return map;
  }, [members, receipt.items]);
  const assign = useAssignItems(receipt, people);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const save = (items: AssignReceiptItemsRequest["items"]) => {
    if (items.length > 0) {
      assign.mutate({ items });
    }
  };
  const itemIds = new Set(receipt.items.map(({ id }) => id));
  const selectedIds = [...selected].filter((id) => itemIds.has(id));

  return (
    <div className="flex flex-col gap-6">
      {unsavedEdits ? (
        <Alert>
          <PencilIcon aria-hidden />
          <AlertTitle>Your item edits aren't saved</AlertTitle>
          <AlertDescription>
            The items below are as last saved. Save the draft under Edit items
            to split it as edited.
          </AlertDescription>
        </Alert>
      ) : null}
      <section aria-labelledby="assign-items" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium" id="assign-items">
            Who had what
          </h2>
          <Button
            disabled={receipt.items.length === 0 || members.length === 0}
            onClick={() =>
              save(
                receipt.items.map(({ id }) => ({
                  itemId: id,
                  assignees: equalAssignees(members.map((user) => user.id)),
                }))
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <UsersIcon aria-hidden data-icon="inline-start" />
            Split everything equally
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Tap the people who had each item, or Everyone, to split it equally
          between them. Select several items to assign them at once.
        </p>
        {selectedIds.length > 0 ? (
          <SelectionBar
            count={selectedIds.length}
            members={members}
            onAssign={(userIds) => {
              save(
                selectedIds.map((itemId) => ({
                  itemId,
                  assignees: equalAssignees(userIds),
                }))
              );
              setSelected(new Set());
            }}
            onClear={() => setSelected(new Set())}
          />
        ) : null}
        {receipt.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            The receipt has no items yet. Add them under Edit items.
          </p>
        ) : (
          <ul aria-label="Items" className="flex flex-col gap-3">
            {receipt.items.map((item) => (
              <AssignItem
                currency={receipt.currency}
                item={item}
                key={item.id}
                members={members}
                onAssign={(assignees) => save([{ itemId: item.id, assignees }])}
                onSelectedChange={(checked) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (checked) {
                      next.add(item.id);
                    } else {
                      next.delete(item.id);
                    }
                    return next;
                  })
                }
                selected={selected.has(item.id)}
              />
            ))}
          </ul>
        )}
      </section>
      <ConfirmForm
        onEditItems={onEditItems}
        people={members}
        receipt={receipt}
      />
    </div>
  );
}
