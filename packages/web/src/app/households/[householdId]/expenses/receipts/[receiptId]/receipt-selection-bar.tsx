"use client";

import type { UserSummary } from "@homesplit/contracts";
import { useState } from "react";
import { useHousehold } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { EveryoneToggle, PersonToggle } from "./person-toggle";

/** Assigns the selected items to the people picked here, equally. */
export function SelectionBar({
  count,
  members,
  onAssign,
  onClear,
}: {
  count: number;
  members: readonly UserSummary[];
  onAssign: (userIds: string[]) => void;
  onClear: () => void;
}) {
  const { userId } = useHousehold();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const everyone =
    members.length > 0 && members.every((user) => picked.includes(user.id));
  const title = count === 1 ? "1 item selected" : `${count} items selected`;
  return (
    <section
      aria-label="Selected items"
      className="bg-muted/50 flex flex-col gap-3 rounded-xl border p-3"
    >
      <p className="text-sm font-medium" role="status">
        {title}
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Assign the selected items to</legend>
        <EveryoneToggle
          onClick={() =>
            setPicked(everyone ? [] : members.map((user) => user.id))
          }
          pressed={everyone}
        />
        {members.map((user) => (
          <PersonToggle
            key={user.id}
            onClick={() =>
              setPicked((current) =>
                current.includes(user.id)
                  ? current.filter((id) => id !== user.id)
                  : [...current, user.id]
              )
            }
            pressed={picked.includes(user.id)}
            user={user}
            you={user.id === userId}
          />
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={picked.length === 0}
          onClick={() => onAssign([...picked])}
          size="sm"
          type="button"
        >
          {picked.length > 1
            ? `Split between ${picked.length} people`
            : "Assign"}
        </Button>
        <Button onClick={onClear} size="sm" type="button" variant="ghost">
          Clear selection
        </Button>
      </div>
    </section>
  );
}
