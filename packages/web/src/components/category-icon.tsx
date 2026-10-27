import type { ExpenseCategory } from "@homesplit/contracts";
import { cn } from "cn";
import { TagIcon } from "lucide-react";

interface CategoryIconProps {
  category: Pick<ExpenseCategory, "icon"> | null;
  className?: string;
}

/** The category's emoji in a circle, or a tag for a category without one or no category. */
export function CategoryIcon({ category, className }: CategoryIconProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
        className
      )}
    >
      {category?.icon ?? <TagIcon className="size-4 text-muted-foreground" />}
    </span>
  );
}
