"use client";

import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { readBoughtOpen, rememberBoughtOpen } from "@/lib/shopping-preferences";

export function BoughtSection({
  count,
  children,
  onClear,
}: {
  children: ReactNode;
  count: number;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(readBoughtOpen);
  const listId = useId();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium" id={headingId}>
          <Button
            aria-controls={listId}
            aria-expanded={open}
            className="aria-expanded:not-hover:bg-transparent"
            onClick={() => {
              setOpen(!open);
              rememberBoughtOpen(!open);
            }}
            variant="ghost"
          >
            <ChevronDownIcon
              aria-hidden
              className={open ? undefined : "-rotate-90"}
              data-icon="inline-start"
            />
            Bought ({count})
          </Button>
        </h2>
        {onClear ? (
          <Button onClick={onClear} size="sm" variant="outline">
            Clear bought
          </Button>
        ) : null}
      </div>
      <ul
        className="flex flex-col divide-y overflow-hidden rounded-xl border"
        hidden={!open}
        id={listId}
      >
        {children}
      </ul>
    </section>
  );
}
