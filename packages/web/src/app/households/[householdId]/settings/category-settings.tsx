"use client";

import {
  CreateExpenseCategoryRequest,
  type ExpenseCategory,
} from "@homesplit/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TagIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { useAppForm } from "@/components/form";
import { ListSkeleton } from "@/components/list-skeleton";
import { QueryState } from "@/components/query-state";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/responsive-dialog";
import {
  useFeatureEnabled,
  useHouseholdId,
  usePermissions,
} from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { endpointQuery, invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { applyServerErrors } from "@/lib/form";

/**
 * Expense categories: every member sees them, and admins and owners create,
 * rename, re-icon, and delete them while expenses are on.
 */
export function CategorySettings() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled("expenses");
  const can = usePermissions();
  const editable = enabled && can.manageCategories;
  const categories = useQuery(
    endpointQuery("listExpenseCategories", { params: { householdId } })
  );

  let hint = "Group expenses, like groceries or rent.";
  if (!can.manageCategories) {
    hint = "Only admins and owners can change them.";
  } else if (!enabled) {
    hint = "Turn expenses back on to change them.";
  }

  return (
    <section
      aria-labelledby="categories-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-base" id="categories-heading">
            Expense categories
          </h2>
          <p className="text-muted-foreground text-sm">{hint}</p>
        </div>
        {editable && categories.data?.items.length ? (
          <CategoryDialog trigger={newCategoryButton} />
        ) : null}
      </div>
      <QueryState
        query={categories}
        skeleton={<ListSkeleton label="Loading categories" rows={3} />}
      >
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState
              action={
                editable ? <CategoryDialog trigger={newCategoryButton} /> : null
              }
              description="Categories group expenses, like groceries or rent."
              icon={TagIcon}
              title="No categories yet"
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {items.map((category) => (
                <CategoryRow
                  category={category}
                  editable={editable}
                  key={category.id}
                />
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}

// An element rather than a component, so the dialog trigger can pass its props to the button.
const newCategoryButton = (
  <Button>
    <PlusIcon aria-hidden data-icon="inline-start" />
    New category
  </Button>
);

function useInvalidateCategories() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  // Expenses embed their category, so they're refetched with it.
  return () =>
    invalidate(queryClient, [
      queryKeys.endpoint("listExpenseCategories", { params: { householdId } }),
      queryKeys.endpoint("listExpenses", { params: { householdId } }),
      [...queryKeys.household(householdId), "getExpense"],
    ]);
}

function CategoryRow({
  category,
  editable,
}: {
  category: ExpenseCategory;
  editable: boolean;
}) {
  const householdId = useHouseholdId();
  const invalidateCategories = useInvalidateCategories();
  const remove = useMutation({
    mutationFn: () =>
      api("deleteExpenseCategory", {
        params: { householdId, categoryId: category.id },
      }),
    onSuccess: invalidateCategories,
  });

  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <CategoryIcon category={category} />
      <span className="flex-1 truncate font-medium">{category.name}</span>
      {editable ? (
        <>
          <CategoryDialog
            category={category}
            trigger={
              <Button
                aria-label={`Edit ${category.name}`}
                size="icon"
                variant="ghost"
              >
                <PencilIcon aria-hidden />
              </Button>
            }
          />
          <ConfirmDialog
            confirmLabel="Delete"
            describeError={(error) =>
              isApiRequestError(error) && error.code === "CATEGORY_IN_USE"
                ? "Some expenses use this category. Move them to another one first."
                : errorMessage(error)
            }
            description="Expenses never lose their category this way: deleting fails while any expense uses it."
            destructive
            onConfirm={() => remove.mutateAsync()}
            title={`Delete “${category.name}”?`}
            trigger={
              <Button
                aria-label={`Delete ${category.name}`}
                size="icon"
                variant="ghost"
              >
                <Trash2Icon aria-hidden />
              </Button>
            }
          />
        </>
      ) : null}
    </li>
  );
}

/** Creates a category, or edits `category` when given. */
function CategoryDialog({
  category,
  trigger,
}: {
  category?: ExpenseCategory;
  trigger: ReactElement;
}) {
  const householdId = useHouseholdId();
  const [open, setOpen] = useState(false);
  const invalidateCategories = useInvalidateCategories();
  const save = useMutation({
    mutationFn: (body: CreateExpenseCategoryRequest) =>
      category
        ? api("updateExpenseCategory", {
            params: { householdId, categoryId: category.id },
            body,
          })
        : api("createExpenseCategory", { params: { householdId }, body }),
    onSuccess: invalidateCategories,
  });
  const defaultValues: CreateExpenseCategoryRequest = {
    name: category?.name ?? "",
    icon: category?.icon ?? null,
  };
  const form = useAppForm({
    defaultValues,
    // The request schema validates the form, so client and server agree on the rules.
    validators: { onSubmit: CreateExpenseCategoryRequest },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync(value);
        setOpen(false);
        formApi.reset();
      } catch (error) {
        applyServerErrors(formApi, error);
      }
    },
  });
  const title = category ? `Edit “${category.name}”` : "New category";

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
        }
      }}
      open={open}
    >
      <ResponsiveDialogTrigger render={trigger} />
      <ResponsiveDialogContent>
        <form.AppForm>
          <form.Form className="contents">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                Everyone in the household can use it.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody className="flex flex-col gap-4">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    autoComplete="off"
                    label="Name"
                    placeholder="Groceries"
                  />
                )}
              </form.AppField>
              <form.AppField name="icon">
                {(field) => (
                  <field.EmojiField
                    description="Optional. Shown next to the name."
                    label="Icon"
                  />
                )}
              </form.AppField>
              <form.FormError />
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose render={<Button variant="outline" />}>
                Cancel
              </ResponsiveDialogClose>
              <form.SubmitButton>
                {category ? "Save" : "Create"}
              </form.SubmitButton>
            </ResponsiveDialogFooter>
          </form.Form>
        </form.AppForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
