"use client";

import type { UserSummary } from "@homesplit/contracts";
import { cn } from "cn";
import { CheckIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/user-avatar";

const WHITESPACE = /\s+/u;

function firstName(name: string): string {
  return name.trim().split(WHITESPACE)[0] ?? name;
}

/** A person's avatar as a toggle, with their first name under it. */
export function PersonToggle({
  user,
  pressed,
  onClick,
  you,
  departed = false,
}: {
  departed?: boolean;
  onClick: () => void;
  pressed: boolean;
  user: UserSummary;
  you: boolean;
}) {
  return (
    <ToggleChip
      icon={<UserAvatar decorative departed={departed} user={user} />}
      label={you ? "You" : firstName(user.name)}
      name={`${user.name}${you ? " (you)" : ""}${departed ? " (left)" : ""}`}
      onClick={onClick}
      pressed={pressed}
    />
  );
}

/** Everyone in the household at once, so a big household isn't a tap per person. */
export function EveryoneToggle({
  pressed,
  onClick,
}: {
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <ToggleChip
      icon={
        <span className="bg-muted flex size-8 items-center justify-center rounded-full border">
          <UsersIcon aria-hidden className="size-4" />
        </span>
      }
      label="Everyone"
      name="Everyone"
      onClick={onClick}
      pressed={pressed}
    />
  );
}

/** A round toggle with a short label under it, and the full `name` for screen readers. */
function ToggleChip({
  icon,
  label,
  name,
  pressed,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  name: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      aria-pressed={pressed}
      className="focus-visible:ring-ring/50 hover:bg-muted flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-xs outline-none focus-visible:ring-3"
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "ring-offset-background relative rounded-full ring-2 ring-offset-2",
          pressed ? "ring-primary" : "ring-transparent"
        )}
      >
        {icon}
        {pressed ? (
          <span className="bg-primary text-primary-foreground ring-background absolute -right-1 -bottom-1 rounded-full p-0.5 ring-2">
            <CheckIcon aria-hidden className="size-2.5" />
          </span>
        ) : null}
      </span>
      <span aria-hidden className="w-full truncate text-center">
        {label}
      </span>
      <span className="sr-only">{name}</span>
    </button>
  );
}
