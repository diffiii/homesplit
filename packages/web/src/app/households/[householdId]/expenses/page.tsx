"use client";

import {
  CreateExpenseCategoryRequest,
  type ExpenseCategory,
} from "@homesplit/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, TagIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { useAppForm } from "@/components/form";
import { ListSkeleton } from "@/components/list-skeleton";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
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
import { useHouseholdId } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { useFeatureEnabled } from "@/hooks/use-household-features";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { endpointQuery, invalidate } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { applyServerErrors } from "@/lib/form";

/**
 * Expense categories, the first module screen with real data: a list with
 * loading, empty, and error states, a create form validated by the contract
 * schema, and a confirmed delete. The expenses epic builds the rest.
 */
export default function ExpensesPage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled(householdId, "expenses");
  const categories = useQuery(
    endpointQuery("listExpenseCategories", { params: { householdId } })
  );

  return (
    <>
      <PageHeader
        actions={
          enabled && categories.data?.items.length ? (
            <CreateCategoryDialog />
          ) : undefined
        }
        description="Expense categories for this household."
        title="Expenses"
      />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      <QueryState
        query={categories}
        skeleton={<ListSkeleton label="Loading categories" rows={3} />}
      >
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState
              action={enabled ? <CreateCategoryDialog /> : null}
              description="Categories group expenses, like groceries or rent."
              icon={TagIcon}
              title="No categories yet"
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {items.map((category) => (
                <CategoryRow
                  category={category}
                  editable={enabled}
                  key={category.id}
                />
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}

function useInvalidateCategories() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  return () =>
    invalidate(queryClient, [
      queryKeys.endpoint("listExpenseCategories", { params: { householdId } }),
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
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full bg-muted"
      >
        {category.icon ?? <TagIcon className="size-4 text-muted-foreground" />}
      </span>
      <span className="flex-1 truncate font-medium">{category.name}</span>
      {editable ? (
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
      ) : null}
    </li>
  );
}

function CreateCategoryDialog() {
  const householdId = useHouseholdId();
  const [open, setOpen] = useState(false);
  const invalidateCategories = useInvalidateCategories();
  const create = useMutation({
    mutationFn: (body: CreateExpenseCategoryRequest) =>
      api("createExpenseCategory", { params: { householdId }, body }),
    onSuccess: invalidateCategories,
  });
  const defaultValues: CreateExpenseCategoryRequest = { name: "" };
  const form = useAppForm({
    defaultValues,
    // The request schema validates the form, so client and server agree on the rules.
    validators: { onSubmit: CreateExpenseCategoryRequest },
    onSubmit: async ({ value, formApi }) => {
      try {
        await create.mutateAsync(value);
        setOpen(false);
        formApi.reset();
      } catch (error) {
        applyServerErrors(formApi, error);
      }
    },
  });

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
      <ResponsiveDialogTrigger
        render={
          <Button>
            <PlusIcon aria-hidden data-icon="inline-start" />
            New category
          </Button>
        }
      />
      <ResponsiveDialogContent>
        <form.AppForm>
          <form.Form className="contents">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>New category</ResponsiveDialogTitle>
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
              <form.FormError />
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose render={<Button variant="outline" />}>
                Cancel
              </ResponsiveDialogClose>
              <form.SubmitButton>Create</form.SubmitButton>
            </ResponsiveDialogFooter>
          </form.Form>
        </form.AppForm>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
