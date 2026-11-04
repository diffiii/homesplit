"use client";

import type { ShoppingItem } from "@homesplit/contracts";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppForm } from "@/components/form";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { useHouseholdId } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { applyServerErrors, showServerErrors } from "@/lib/form";
import {
  shoppingItemValues,
  toShoppingItemRequest,
  validateShoppingItem,
} from "@/lib/shopping";

interface ItemDialogProps {
  item: ShoppingItem | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ItemDialog({ item, open, onOpenChange }: ItemDialogProps) {
  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent>
        {item ? (
          <ItemForm
            item={item}
            key={item.id}
            onSaved={() => onOpenChange(false)}
          />
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ItemForm({
  item,
  onSaved,
}: {
  item: ShoppingItem;
  onSaved: () => void;
}) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const invalidateList = () =>
    invalidate(queryClient, [
      queryKeys.endpoint("listShoppingItems", { params: { householdId } }),
    ]);
  const update = useMutation({
    mutationFn: (body: ReturnType<typeof toShoppingItemRequest>) =>
      api("updateShoppingItem", {
        params: { householdId, itemId: item.id },
        body,
      }),
  });
  const form = useAppForm({
    defaultValues: shoppingItemValues(item),
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) =>
        validateShoppingItem(value, { requireName: true }),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await update.mutateAsync(toShoppingItemRequest(value));
      } catch (error) {
        if (isApiRequestError(error) && error.status === 404) {
          showServerErrors(formApi, {
            fields: {},
            form: "Someone deleted this item in the meantime.",
          });
          await invalidateList();
        } else {
          applyServerErrors(formApi, error);
        }
        return;
      }
      await invalidateList();
      onSaved();
    },
  });

  return (
    <form.AppForm>
      <form.Form className="contents">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Edit “{item.name}”</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Everyone in the household sees the change.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => <field.TextField autoComplete="off" label="Item" />}
          </form.AppField>
          <div className="grid grid-cols-[6rem_1fr] items-start gap-3">
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
            <form.AppField name="unit">
              {(field) => <field.UnitField label="Unit" />}
            </form.AppField>
          </div>
          <form.FormError />
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            Cancel
          </ResponsiveDialogClose>
          <form.SubmitButton>Save</form.SubmitButton>
        </ResponsiveDialogFooter>
      </form.Form>
    </form.AppForm>
  );
}
