"use client";

import { revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form";
import { useHouseholdId } from "@/components/shell/household-context";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { createShoppingItemKey } from "@/lib/api/shopping-queries";
import {
  EMPTY_SHOPPING_ITEM_VALUES,
  toShoppingItemRequest,
  validateShoppingItem,
} from "@/lib/shopping";

type NewItem = ReturnType<typeof toShoppingItemRequest>;

export function QuickAdd() {
  const householdId = useHouseholdId();
  const nameRef = useRef<HTMLInputElement>(null);
  const create = useMutation({
    mutationKey: createShoppingItemKey(householdId),
    mutationFn: (body: NewItem) =>
      api("createShoppingItem", { params: { householdId }, body }),
    onError: (error, item) => {
      toast.error(`Couldn't add “${item.name}”`, {
        description: errorMessage(error),
        action: { label: "Retry", onClick: () => create.mutate(item) },
      });
    },
    onSettled: (_data, _error, _item, _result, { client }) =>
      invalidate(client, [
        queryKeys.endpoint("listShoppingItems", { params: { householdId } }),
      ]),
  });
  const form = useAppForm({
    defaultValues: EMPTY_SHOPPING_ITEM_VALUES,
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) =>
        validateShoppingItem(value, { requireName: false }),
    },
    onSubmit: ({ value, formApi }) => {
      nameRef.current?.focus();
      if (!value.name.trim()) {
        return;
      }
      create.mutate(toShoppingItemRequest(value));
      formApi.reset();
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid grid-cols-[5rem_1fr_auto] items-start gap-x-2 gap-y-3 sm:grid-cols-[1fr_5rem_8rem_auto]">
        <div className="col-span-2 sm:col-span-1">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                autoComplete="off"
                inputRef={nameRef}
                label="Item"
                placeholder="Milk"
              />
            )}
          </form.AppField>
        </div>
        <div className="row-start-2 sm:col-start-2 sm:row-start-1">
          <form.AppField name="quantity">
            {(field) => (
              <field.TextField
                autoComplete="off"
                inputMode="numeric"
                label="Quantity"
                placeholder="1"
              />
            )}
          </form.AppField>
        </div>
        <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
          <form.AppField name="unit">
            {(field) => <field.UnitField label="Unit" />}
          </form.AppField>
        </div>
        <form.SubmitButton className="col-start-3 row-start-1 mt-[calc(var(--text-sm)*1.375+--spacing(2))] sm:col-start-4">
          <PlusIcon aria-hidden data-icon="inline-start" />
          Add
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
