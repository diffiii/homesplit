"use client";

import type { Chore } from "@homesplit/contracts";
import { cn } from "cn";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import {
  useIsDeparted,
  useUserName,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { isOverdue } from "@/lib/chores";
import { formatIsoDateTime } from "@/lib/dates";

interface ChoreDetailsProps {
  chore: Chore | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** Everything about one chore, read-only; the list row shows only the gist. */
export function ChoreDetails({ chore, open, onOpenChange }: ChoreDetailsProps) {
  const userName = useUserName();
  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent>
        {chore ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{chore.name}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="break-words whitespace-pre-wrap">
                {chore.description ?? "No description."}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Assignee</dt>
                <dd>
                  {chore.assignedTo ? (
                    <Person user={chore.assignedTo} />
                  ) : (
                    "Unassigned"
                  )}
                </dd>
                <dt className="text-muted-foreground">Deadline</dt>
                <dd
                  className={cn(
                    isOverdue(chore) && "text-destructive font-medium"
                  )}
                >
                  {chore.dueAt ? formatIsoDateTime(chore.dueAt) : "None"}
                </dd>
                {chore.isCompleted ? (
                  <>
                    <dt className="text-muted-foreground">Completed</dt>
                    <dd>
                      {formatIsoDateTime(chore.completedAt)} by{" "}
                      {userName(chore.completedBy)}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Added by</dt>
                <dd>
                  <Person user={chore.addedBy} />
                </dd>
              </dl>
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <ResponsiveDialogClose render={<Button variant="outline" />}>
                Close
              </ResponsiveDialogClose>
            </ResponsiveDialogFooter>
          </>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function Person({ user }: { user: Chore["addedBy"] }) {
  const departed = useIsDeparted()(user);
  return (
    <span className="inline-flex items-center gap-2">
      <UserAvatar
        className={cn(departed && "opacity-60 grayscale")}
        decorative
        size="sm"
        user={user}
      />
      <span className={cn(departed && "text-muted-foreground")}>
        {user.name}
      </span>
      {departed ? <Badge variant="outline">Left</Badge> : null}
    </span>
  );
}
