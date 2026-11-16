"use client";

import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { QuickAdd } from "./quick-add";

export function QuickAddSheet() {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <ResponsiveDialog
      onOpenChange={(next) => {
        setOpen(next);
        setAdded(null);
      }}
      open={open}
    >
      <ResponsiveDialogTrigger
        render={
          <Button
            aria-label="Add item"
            className="text-primary hover:text-primary h-10 md:hidden"
            variant="ghost"
          />
        }
      >
        <PlusIcon aria-hidden data-icon="inline-start" />
        Add
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent initialFocus={nameRef}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add items</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-3">
          <QuickAdd nameRef={nameRef} onAdded={setAdded} />
          <p className="text-muted-foreground min-h-5 text-sm" role="status">
            {added ? `${added} added` : null}
          </p>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            Done
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
