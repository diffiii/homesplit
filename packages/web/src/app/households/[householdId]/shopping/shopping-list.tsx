"use client";

import type { ShoppingItem } from "@homesplit/contracts";
import { useMutationState, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  EllipsisIcon,
  PencilIcon,
  ShoppingCartIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { QueryState } from "@/components/query-state";
import {
  useFeatureEnabled,
  useHousehold,
  useIsDeparted,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createShoppingItemKey,
  shoppingListQuery,
} from "@/lib/api/shopping-queries";
import { formatQuantity, type ShoppingItemBody } from "@/lib/shopping";
import { ItemDialog } from "./item-dialog";
import { useDeferredDelete } from "./use-deferred-delete";

export function ShoppingList() {
  const { household, members, userId } = useHousehold();
  const enabled = useFeatureEnabled("shopping");
  const isDeparted = useIsDeparted();
  const list = useQuery(shoppingListQuery(household.id));
  const adding = useMutationState({
    filters: {
      mutationKey: createShoppingItemKey(household.id),
      status: "pending",
    },
    select: (mutation) => ({
      id: mutation.mutationId,
      item: mutation.state.variables as ShoppingItemBody,
    }),
  });
  const me = members.find((member) => member.userId === userId)?.user;
  const { hidden, deleteItem } = useDeferredDelete();

  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <QueryState
        query={list}
        skeleton={<ListSkeleton label="Loading the shopping list" rows={4} />}
      >
        {(data) => {
          const items = data.filter((item) => !hidden.has(item.id)).reverse();
          const count = items.length + adding.length;
          if (count === 0) {
            return (
              <EmptyState
                description="Everything the household adds shows up here, newest first."
                icon={ShoppingCartIcon}
                title="Nothing on the list"
              />
            );
          }
          return (
            <section aria-labelledby="to-buy" className="flex flex-col gap-2">
              <h2 className="text-base font-medium" id="to-buy">
                To buy · {count}
              </h2>
              <ul
                aria-label="Shopping list"
                className="flex flex-col divide-y rounded-xl border"
              >
                {[...adding].reverse().map(({ id, item }) => (
                  <ItemRow
                    addedBy={me?.name ?? "you"}
                    item={item}
                    key={id}
                    pending
                  />
                ))}
                {items.map((item) => (
                  <ItemRow
                    addedBy={`${item.addedBy.name}${isDeparted(item.addedBy) ? " (left)" : ""}`}
                    item={item}
                    key={item.id}
                    menu={
                      enabled ? (
                        <ItemMenu
                          name={item.name}
                          onDelete={() => deleteItem(item)}
                          onEdit={() => {
                            setEditing(item);
                            setEditOpen(true);
                          }}
                        />
                      ) : null
                    }
                  />
                ))}
              </ul>
            </section>
          );
        }}
      </QueryState>
      <ItemDialog item={editing} onOpenChange={setEditOpen} open={editOpen} />
    </>
  );
}

interface ItemRowProps {
  addedBy: string;
  item: Pick<ShoppingItem, "name" | "quantity" | "unit">;
  menu?: ReactNode;
  pending?: boolean;
}

function ItemRow({ item, addedBy, menu, pending = false }: ItemRowProps) {
  const quantity = formatQuantity(item);
  return (
    <li
      aria-busy={pending || undefined}
      className={cn(
        "flex min-h-13 items-center gap-2 py-2 pr-2 pl-4",
        pending && "opacity-60"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium break-words">
          {item.name}
          {quantity ? (
            <>
              {" "}
              <Badge
                className="ml-1 align-[1px] font-normal tabular-nums"
                variant="secondary"
              >
                {quantity}
              </Badge>
            </>
          ) : null}
        </span>
        <span className="text-muted-foreground text-sm">
          Added by {addedBy}
        </span>
      </div>
      {menu ??
        (pending ? <span aria-hidden className="size-8 shrink-0" /> : null)}
    </li>
  );
}

function ItemMenu({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${name}`}
            size="icon"
            variant="ghost"
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon aria-hidden />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} variant="destructive">
          <Trash2Icon aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
