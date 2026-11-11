"use client";

import type { ShoppingItem } from "@homesplit/contracts";
import {
  useIsMutating,
  useMutationState,
  useQuery,
} from "@tanstack/react-query";
import { cn } from "cn";
import { CheckIcon, ShoppingCartIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { QueryState } from "@/components/query-state";
import { RowMenu } from "@/components/row-menu";
import {
  useFeatureEnabled,
  useHousehold,
  useUserName,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import {
  createShoppingItemKey,
  shoppingActionKey,
  shoppingListQuery,
} from "@/lib/api/shopping-queries";
import { formatIsoDateTime, formatRelativeTime } from "@/lib/dates";
import {
  formatQuantity,
  type ShoppingItemBody,
  splitShoppingList,
} from "@/lib/shopping";
import { BoughtSection } from "./bought-section";
import { ItemDialog } from "./item-dialog";
import { useDeferredDelete } from "./use-deferred-delete";
import { usePurchase, useUnpurchase } from "./use-shopping-actions";

export function ShoppingList() {
  const { household, members, userId } = useHousehold();
  const enabled = useFeatureEnabled("shopping");
  const acting =
    useIsMutating({ mutationKey: shoppingActionKey(household.id) }) > 0;
  const list = useQuery(shoppingListQuery(household.id, { poll: !acting }));
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
  const { hidden, deleteItem, clearBought } = useDeferredDelete();
  const purchase = usePurchase();
  const unpurchase = useUnpurchase();
  const hintId = useId();

  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const nameOf = useUserName();
  const menuFor = (item: ShoppingItem) =>
    enabled ? (
      <RowMenu
        name={item.name}
        onDelete={() => deleteItem(item)}
        onEdit={() => {
          setEditing(item);
          setEditOpen(true);
        }}
      />
    ) : null;

  return (
    <>
      <QueryState
        query={list}
        skeleton={<ListSkeleton label="Loading the shopping list" rows={4} />}
      >
        {(data) => {
          const { toBuy, bought } = splitShoppingList(
            data.filter((item) => !hidden.has(item.id))
          );
          const count = toBuy.length + adding.length;
          if (count === 0 && bought.length === 0) {
            return (
              <EmptyState
                description="Everything the household adds shows up here, newest first."
                icon={ShoppingCartIcon}
                title="Nothing on the list"
              />
            );
          }
          return (
            <>
              <section aria-labelledby="to-buy" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <h2 className="text-base font-medium" id="to-buy">
                    To buy ({count})
                  </h2>
                  {enabled && toBuy.length > 0 ? (
                    <p className="sr-only" id={hintId}>
                      Click or tap an item once it's in your basket
                    </p>
                  ) : null}
                </div>
                {count === 0 ? (
                  <p className="text-muted-foreground">Everything's bought.</p>
                ) : (
                  <ul
                    aria-label="Shopping list"
                    className="flex flex-col divide-y overflow-hidden rounded-xl border"
                  >
                    {[...adding].reverse().map(({ id, item }) => (
                      <ItemRow
                        detail={`Added by ${me?.name ?? "you"}`}
                        item={item}
                        key={id}
                        pending
                      />
                    ))}
                    {toBuy.map((item) => (
                      <ItemRow
                        describedBy={hintId}
                        detail={`Added by ${nameOf(item.addedBy)}`}
                        item={item}
                        key={item.id}
                        menu={menuFor(item)}
                        onToggle={
                          enabled ? () => purchase.mutate(item) : undefined
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>
              {bought.length > 0 ? (
                <BoughtSection
                  count={bought.length}
                  onClear={enabled ? () => clearBought(bought) : undefined}
                >
                  {bought.map((item) => (
                    <ItemRow
                      bought
                      detail={
                        <>
                          {nameOf(item.purchasedBy)} bought it ·{" "}
                          <time
                            dateTime={item.purchasedAt}
                            title={formatIsoDateTime(item.purchasedAt)}
                          >
                            {formatRelativeTime(item.purchasedAt)}
                          </time>
                        </>
                      }
                      item={item}
                      key={item.id}
                      menu={menuFor(item)}
                      onToggle={
                        enabled ? () => unpurchase.mutate(item) : undefined
                      }
                    />
                  ))}
                </BoughtSection>
              ) : null}
            </>
          );
        }}
      </QueryState>
      <ItemDialog item={editing} onOpenChange={setEditOpen} open={editOpen} />
    </>
  );
}

interface ItemRowProps {
  bought?: boolean;
  describedBy?: string;
  detail: ReactNode;
  item: Pick<ShoppingItem, "name" | "quantity" | "unit">;
  menu?: ReactNode;
  onToggle?: () => void;
  pending?: boolean;
}

function ItemRow({
  item,
  detail,
  bought = false,
  describedBy,
  menu,
  onToggle,
  pending = false,
}: ItemRowProps) {
  const quantity = formatQuantity(item);
  const layout = "flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left";
  const content = (
    <>
      {bought ? (
        <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
          <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium break-words">
          <span className={cn(bought && "text-muted-foreground line-through")}>
            {item.name}
          </span>
          {quantity ? (
            <>
              {" "}
              <Badge
                className={cn(
                  "ml-1 max-w-full align-[1px] font-normal tabular-nums",
                  bought && "line-through"
                )}
                variant="secondary"
              >
                {quantity}
              </Badge>
            </>
          ) : null}
        </span>
        <span className="text-muted-foreground text-sm break-words">
          {detail}
        </span>
      </span>
    </>
  );
  return (
    <li
      aria-busy={pending || undefined}
      className={cn(
        "flex min-h-13 items-center gap-1 pr-2",
        pending && "opacity-60"
      )}
    >
      {onToggle ? (
        <button
          aria-describedby={describedBy}
          aria-pressed={bought}
          className={cn(
            layout,
            "hover:bg-muted/50 active:bg-muted focus-visible:ring-ring/50 cursor-pointer touch-manipulation self-stretch outline-none focus-visible:ring-3 focus-visible:ring-inset"
          )}
          onClick={onToggle}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className={layout}>{content}</div>
      )}
      {menu ??
        (pending ? (
          <span aria-hidden className="size-10 shrink-0 sm:size-8" />
        ) : null)}
    </li>
  );
}
