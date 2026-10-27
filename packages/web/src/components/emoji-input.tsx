"use client";

import { SmilePlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EmojiInputProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  id?: string;
  onValueChange: (emoji: string | null) => void;
  value: string | null;
}

/**
 * A button showing the chosen emoji that opens a searchable picker, and one
 * that clears it. The picker loads its emoji data from the jsDelivr CDN.
 */
export function EmojiInput({
  value,
  onValueChange,
  id,
  ...aria
}: EmojiInputProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              {...aria}
              aria-label={value ? `Icon: ${value}` : "Choose an icon"}
              className="text-lg"
              id={id}
              size="icon-lg"
              variant="outline"
            />
          }
        >
          {value ?? (
            <SmilePlusIcon aria-hidden className="text-muted-foreground" />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Emoji picker"
          className="w-fit p-0"
        >
          <EmojiPicker
            className="h-80"
            columns={8}
            onEmojiSelect={({ emoji }) => {
              onValueChange(emoji);
              setOpen(false);
            }}
          >
            <EmojiPickerSearch aria-label="Search emoji" />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button onClick={() => onValueChange(null)} size="sm" variant="ghost">
          <XIcon aria-hidden data-icon="inline-start" />
          Remove icon
        </Button>
      ) : null}
    </div>
  );
}
