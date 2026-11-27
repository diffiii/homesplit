"use client";

import type { Receipt } from "@homesplit/contracts";
import { cn } from "cn";
import { PencilIcon, UsersIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ReceiptAssignment } from "./receipt-assignment";
import { ReceiptDraftForm } from "./receipt-draft-form";

type WorkspaceView = "items" | "assign";

/**
 * A draft that's read: fixing its items, and saying who had them. It opens
 * on assigning once the items add up, and on the items until then. Both
 * stay mounted, so switching keeps what's typed.
 */
export function ReceiptWorkspace({ receipt }: { receipt: Receipt }) {
  const [view, setView] = useState<WorkspaceView>(() =>
    receipt.items.length > 0 && receipt.differenceCents === 0
      ? "assign"
      : "items"
  );
  const [unsavedEdits, setUnsavedEdits] = useState(false);
  const switcher = useRef<HTMLFieldSetElement>(null);
  const show = (next: WorkspaceView) => {
    setView(next);
    // From the summary at the bottom, the other view starts out of sight.
    switcher.current?.scrollIntoView?.({ block: "nearest" });
  };
  return (
    <>
      <fieldset
        className="bg-muted flex self-start rounded-lg p-0.5"
        ref={switcher}
      >
        <legend className="sr-only">Step</legend>
        <ViewButton onClick={() => show("items")} pressed={view === "items"}>
          <PencilIcon aria-hidden data-icon="inline-start" />
          Edit items
        </ViewButton>
        <ViewButton onClick={() => show("assign")} pressed={view === "assign"}>
          <UsersIcon aria-hidden data-icon="inline-start" />
          Assign items
        </ViewButton>
      </fieldset>
      <div className="contents" hidden={view !== "items"}>
        <ReceiptDraftForm onDirtyChange={setUnsavedEdits} receipt={receipt} />
      </div>
      <div className="contents" hidden={view !== "assign"}>
        <ReceiptAssignment
          onEditItems={() => show("items")}
          receipt={receipt}
          unsavedEdits={unsavedEdits}
        />
      </div>
    </>
  );
}

function ViewButton({
  pressed,
  onClick,
  children,
}: {
  children: ReactNode;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <Button
      aria-pressed={pressed}
      className={cn(
        pressed
          ? "bg-background text-foreground hover:bg-background shadow-sm"
          : "hover:bg-background/60"
      )}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
