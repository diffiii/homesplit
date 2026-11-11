"use client";

import type { Chore } from "@homesplit/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ListChecksIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { RowMenu } from "@/components/row-menu";
import {
  useHousehold,
  useIsDeparted,
  useUserName,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { choreListQuery } from "@/lib/api/chore-queries";
import { type ChoreFilters, isOverdue } from "@/lib/chores";
import {
  formatDueTime,
  formatIsoDateTime,
  formatRelativeTime,
} from "@/lib/dates";
import { ChoreDetails } from "./chore-details";
import { useDeleteChore } from "./use-delete-chore";

interface ChoreListProps {
  /** Shown in the empty state, such as a button to add the first chore. */
  emptyAction?: ReactNode;
  filters: ChoreFilters;
  /** Left out while the module is off, which hides the row menus. */
  onEdit?: (chore: Chore) => void;
}

export function ChoreList({ emptyAction, filters, onEdit }: ChoreListProps) {
  const { household, userId } = useHousehold();
  const list = useInfiniteQuery(
    choreListQuery(household.id, {
      assignedToId: filters.mine ? userId : undefined,
      includeCompleted: filters.completed,
    })
  );
  const { hidden, deleteChore } = useDeleteChore();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  // Deadlines turn overdue, and "Today" turns "Yesterday", without new data.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (list.status === "pending") {
    return <ListSkeleton label="Loading chores" rows={4} />;
  }
  if (list.status === "error") {
    return (
      <ErrorState
        error={list.error}
        onRetry={list.refetch}
        retrying={list.isRefetching}
        title="Couldn't load chores"
      />
    );
  }

  const loaded = list.data.pages.flatMap((page) => page.items);
  const chores = loaded.filter((chore) => !hidden.has(chore.id));
  const open = chores.filter((chore) => !chore.isCompleted);
  const completed = chores.filter((chore) => chore.isCompleted);
  const viewing = chores.find((chore) => chore.id === viewingId) ?? null;
  const total =
    (list.data.pages.at(-1)?.totalItems ?? 0) - (loaded.length - chores.length);

  const rows = (items: readonly Chore[], label: string) => (
    <ul
      aria-label={label}
      className="flex flex-col divide-y overflow-hidden rounded-xl border"
    >
      {items.map((chore) => (
        <ChoreRow
          chore={chore}
          key={chore.id}
          menu={
            onEdit ? (
              <RowMenu
                name={chore.name}
                onDelete={() => deleteChore(chore)}
                onEdit={() => onEdit(chore)}
              />
            ) : null
          }
          now={now}
          onOpen={() => {
            setViewingId(chore.id);
            setViewOpen(true);
          }}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      {open.length > 0 ? rows(open, "Chores") : null}
      {open.length === 0 && filters.mine ? (
        <EmptyState
          description="Chores assigned to you show up here."
          icon={ListChecksIcon}
          title="Nothing for you to do"
        />
      ) : null}
      {open.length === 0 && !filters.mine ? (
        <EmptyState
          action={emptyAction}
          description="Chores everyone adds show up here, soonest deadline first."
          icon={ListChecksIcon}
          title="Nothing to do"
        />
      ) : null}
      {completed.length > 0 ? (
        <section
          aria-labelledby="chores-completed"
          className="flex flex-col gap-2"
        >
          <h2
            className="text-muted-foreground text-sm font-medium"
            id="chores-completed"
          >
            Completed
          </h2>
          {rows(completed, "Completed chores")}
        </section>
      ) : null}
      {list.hasNextPage ? (
        <LoadMore
          noun={["chore", "chores"]}
          query={list}
          shown={chores.length}
          total={total}
        />
      ) : null}
      <ChoreDetails
        chore={viewing}
        onOpenChange={setViewOpen}
        open={viewOpen && viewing !== null}
      />
    </div>
  );
}

interface ChoreRowProps {
  chore: Chore;
  menu: ReactNode;
  now: Date;
  onOpen: () => void;
}

function ChoreRow({ chore, menu, now, onOpen }: ChoreRowProps) {
  const isDeparted = useIsDeparted();
  const who = useUserName();
  return (
    <li className="flex min-h-13 items-center gap-1 pr-2">
      <button
        className="hover:bg-muted/50 active:bg-muted focus-visible:ring-ring/50 flex min-w-0 flex-1 cursor-pointer touch-manipulation flex-col self-stretch py-2 pl-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset"
        onClick={onOpen}
        type="button"
      >
        <span
          className={cn(
            "font-medium break-words",
            chore.isCompleted && "text-muted-foreground line-through"
          )}
        >
          {chore.name}
        </span>
        <span className="text-muted-foreground text-sm break-words">
          {chore.isCompleted ? (
            <>
              {who(chore.completedBy)} did it ·{" "}
              <time
                dateTime={chore.completedAt}
                title={formatIsoDateTime(chore.completedAt)}
              >
                {formatRelativeTime(chore.completedAt)}
              </time>
            </>
          ) : (
            <>
              {chore.assignedTo?.name ?? "Unassigned"}
              {chore.assignedTo && isDeparted(chore.assignedTo) ? (
                <Badge className="ml-1.5 align-[1px]" variant="outline">
                  Left
                </Badge>
              ) : null}
              {chore.dueAt ? (
                <>
                  {" · "}
                  <time
                    className={cn(
                      isOverdue(chore, now) && "text-destructive font-medium"
                    )}
                    dateTime={chore.dueAt}
                    title={formatIsoDateTime(chore.dueAt)}
                  >
                    {formatDueTime(chore.dueAt, now)}
                  </time>
                </>
              ) : null}
            </>
          )}
        </span>
      </button>
      {menu}
    </li>
  );
}
