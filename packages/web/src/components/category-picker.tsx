"use client";

import type { ExpenseCategory } from "@homesplit/contracts";
import { useQuery } from "@tanstack/react-query";
import { CategoryIcon } from "@/components/category-icon";
import { useHouseholdId } from "@/components/shell/household-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { endpointQuery } from "@/lib/api/queries";

interface CategoryPickerProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  id?: string;
  /** The empty choice's label. */
  noneLabel?: string;
  onBlur?: () => void;
  onValueChange: (categoryId: string | null) => void;
  /** A category ID, or `null` for no category. */
  value: string | null;
}

/**
 * The household's categories with their icons, plus an empty choice first.
 * A value that's no longer in the list, such as a deleted category, shows as
 * the empty choice.
 */
export function CategoryPicker({
  value,
  onValueChange,
  onBlur,
  noneLabel = "No category",
  className,
  ...trigger
}: CategoryPickerProps) {
  const householdId = useHouseholdId();
  const categories = useQuery(
    endpointQuery("listExpenseCategories", { params: { householdId } })
  );
  const items = categories.data?.items ?? [];
  const byId = new Map(items.map((category) => [category.id, category]));
  const selected = (value && byId.get(value)) || null;

  return (
    <Select
      items={[
        { value: null, label: noneLabel },
        ...items.map(({ id, name }) => ({ value: id, label: name })),
      ]}
      onOpenChange={(open) => {
        if (!open) {
          onBlur?.();
        }
      }}
      onValueChange={(next: string | null) => onValueChange(next)}
      value={selected?.id ?? null}
    >
      <SelectTrigger
        {...trigger}
        className={className ?? "w-full"}
        disabled={categories.isPending}
      >
        <SelectValue>
          {(id: string | null) => (
            <CategoryLabel
              category={byId.get(id ?? "") ?? null}
              noneLabel={noneLabel}
            />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>
          <CategoryLabel category={null} noneLabel={noneLabel} />
        </SelectItem>
        {items.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <CategoryLabel category={category} noneLabel={noneLabel} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategoryLabel({
  category,
  noneLabel,
}: {
  category: ExpenseCategory | null;
  noneLabel: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryIcon category={category} className="size-6 text-sm" />
      <span className="truncate">{category?.name ?? noneLabel}</span>
    </span>
  );
}
