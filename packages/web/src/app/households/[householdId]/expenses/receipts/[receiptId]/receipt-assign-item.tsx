"use client";

import type { ReceiptItem, UserSummary } from "@homesplit/contracts";
import { cn } from "cn";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useId } from "react";
import { useHousehold } from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UserLabel } from "@/components/user-avatar";
import {
  assignedUnits,
  countsUnits,
  equalAssignees,
  type ItemAssignees,
  setUnits,
  toggleAssignee,
} from "@/lib/receipt-assignment";
import { formatReceiptAmount } from "@/lib/receipts";
import { EveryoneToggle, PersonToggle } from "./person-toggle";

interface AssignItemProps {
  currency: string | null;
  item: ReceiptItem;
  /** Current members, the user first. */
  members: readonly UserSummary[];
  onAssign: (assignees: ItemAssignees) => void;
  onSelectedChange: (selected: boolean) => void;
  selected: boolean;
}

/** One item: what it cost, who had it, and, for items counted in units, how many each. */
export function AssignItem({
  item,
  currency,
  members,
  onAssign,
  onSelectedChange,
  selected,
}: AssignItemProps) {
  const { userId } = useHousehold();
  const id = useId();
  const amount = (cents: number) => formatReceiptAmount(cents, currency);
  const current = new Set(members.map((user) => user.id));
  // Someone who left keeps a toggle while they're on the item, to take them off.
  const departed = item.assignments
    .map(({ user }) => user)
    .filter((user) => !current.has(user.id));
  const assigned = new Map(
    item.assignments.map(({ user, shares }) => [user.id, shares])
  );
  const units = countsUnits(item);
  // Tapping it again takes everyone off the item.
  const everyone =
    members.length > 0 && members.every((user) => assigned.has(user.id));

  return (
    <li
      aria-labelledby={`${id}-name`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3",
        selected && "border-primary"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          aria-label={`Select ${item.name}`}
          checked={selected}
          className="mt-0.5"
          onCheckedChange={(checked) => onSelectedChange(checked)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium" id={`${id}-name`}>
            {item.name}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {item.quantity} × {amount(item.unitPriceCents)}
            {item.discountCents > 0 ? ` − ${amount(item.discountCents)}` : ""} ={" "}
            <span className="text-foreground">{amount(item.totalCents)}</span>
          </span>
        </div>
        <AssignStatus item={item} />
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Who had {item.name}</legend>
        <EveryoneToggle
          onClick={() =>
            onAssign(
              everyone ? [] : equalAssignees(members.map((user) => user.id))
            )
          }
          pressed={everyone}
        />
        {[...members, ...departed].map((user) => (
          <PersonToggle
            departed={!current.has(user.id)}
            key={user.id}
            onClick={() => onAssign(toggleAssignee(item, user.id))}
            pressed={assigned.has(user.id)}
            user={user}
            you={user.id === userId}
          />
        ))}
      </fieldset>
      {units && item.assignments.length > 0 ? (
        <ul
          aria-label={`Units of ${item.name}`}
          className="flex flex-col gap-2"
        >
          {item.assignments.map(({ user, shares }) => (
            <li
              className="flex items-center justify-between gap-3"
              key={user.id}
            >
              <UserLabel size="sm" user={user} you={user.id === userId} />
              <UnitStepper
                max={item.quantity}
                name={user.id === userId ? "you" : user.name}
                onChange={(next) => onAssign(setUnits(item, user.id, next))}
                value={shares}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** "2/3 assigned" for items counted in units, and whether anyone has the item yet. */
function AssignStatus({ item }: { item: ReceiptItem }) {
  if (countsUnits(item)) {
    const given = assignedUnits(item);
    return (
      <Badge
        className="shrink-0 tabular-nums"
        variant={given === item.quantity ? "secondary" : "outline"}
      >
        {given}/{item.quantity} assigned
      </Badge>
    );
  }
  return item.assignments.length === 0 ? (
    <Badge className="shrink-0" variant="outline">
      Unassigned
    </Badge>
  ) : null;
}

/** How many units someone had, from 1 up to the item's quantity. */
function UnitStepper({
  value,
  max,
  name,
  onChange,
}: {
  max: number;
  name: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={`One fewer for ${name}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <MinusIcon aria-hidden />
      </Button>
      <output
        aria-label={`Units for ${name}`}
        className="w-8 text-center text-sm font-medium tabular-nums"
      >
        {value}
      </output>
      <Button
        aria-label={`One more for ${name}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  );
}
