"use client";

import { CalendarIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatIsoDate,
  formatTimeOfDay,
  parseIsoDate,
  toIsoDate,
} from "@/lib/dates";

const HALF_HOURS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 === 0 ? "00" : "30"}`;
});

interface DeadlineFieldProps {
  /** An `IsoDate`, or empty for no deadline. */
  date: string;
  onChange: (date: string, time: string) => void;
  /** `HH:MM`, kept while there's no date so picking one brings it back. */
  time: string;
}

export function DeadlineField({ date, time, onChange }: DeadlineFieldProps) {
  const [open, setOpen] = useState(false);
  const dateId = useId();
  const timeId = useId();
  const label = date ? formatIsoDate(date) : "No deadline";
  // A deadline set elsewhere may fall between the half hours.
  const times = [...new Set([...HALF_HOURS, time])].sort();
  const items = times.map((value) => ({
    value,
    label: formatTimeOfDay(value),
  }));

  return (
    <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={dateId}>Deadline</Label>
        <div className="flex gap-1">
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger
              render={
                <Button
                  aria-label={`Deadline: ${label}`}
                  className="min-w-0 flex-1 justify-start font-normal"
                  id={dateId}
                  variant="outline"
                />
              }
            >
              <CalendarIcon aria-hidden data-icon="inline-start" />
              <span className={date ? undefined : "text-muted-foreground"}>
                {label}
              </span>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label="Deadline"
              className="w-auto"
            >
              <Calendar
                defaultMonth={date ? parseIsoDate(date) : undefined}
                mode="single"
                onSelect={(day) => {
                  if (day) {
                    onChange(toIsoDate(day), time);
                    setOpen(false);
                  }
                }}
                selected={date ? parseIsoDate(date) : undefined}
              />
              {date ? (
                <Button
                  onClick={() => {
                    onChange("", time);
                    setOpen(false);
                  }}
                  variant="ghost"
                >
                  <XIcon aria-hidden data-icon="inline-start" />
                  No deadline
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={timeId}>Time</Label>
        <Select
          disabled={!date}
          items={items}
          onValueChange={(next: string | null) => {
            if (next !== null) {
              onChange(date, next);
            }
          }}
          value={time}
        >
          <SelectTrigger className="w-full" id={timeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
