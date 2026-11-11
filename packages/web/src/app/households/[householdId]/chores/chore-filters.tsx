"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { type ChoreFilters, choreFiltersSearch } from "@/lib/chores";

const VIEWS = [
  { label: "All", mine: false },
  { label: "Mine", mine: true },
];

/** Applies filters by replacing the URL, so they survive a reload and can be shared. */
function useSetChoreFilters(): (filters: ChoreFilters) => void {
  const router = useRouter();
  const pathname = usePathname();
  return (filters) => {
    const search = choreFiltersSearch(filters);
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  };
}

export function ChoreViewPicker({ filters }: { filters: ChoreFilters }) {
  const setFilters = useSetChoreFilters();
  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">Whose chores</legend>
      {VIEWS.map(({ label, mine }) => (
        <Button
          aria-pressed={filters.mine === mine}
          key={label}
          onClick={() => setFilters({ ...filters, mine })}
          size="sm"
          variant={filters.mine === mine ? "default" : "outline"}
        >
          {label}
        </Button>
      ))}
    </fieldset>
  );
}

export function CompletedToggle({ filters }: { filters: ChoreFilters }) {
  const setFilters = useSetChoreFilters();
  return (
    <Button
      className="self-center"
      onClick={() => setFilters({ ...filters, completed: !filters.completed })}
      variant="link"
    >
      {filters.completed ? "Hide completed" : "Show completed"}
    </Button>
  );
}
