import type { FriendUser } from "@homesplit/contracts";
import { cn } from "cn";
import { UserAvatar } from "@/components/user-avatar";

/**
 * Avatar beside the name and email, as friends are listed. Wraps rather than
 * truncates, as member rows do, so long names and emails stay readable.
 */
export function FriendLabel({
  user,
  className,
}: {
  className?: string;
  user: FriendUser;
}) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      <UserAvatar decorative user={user} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="wrap-anywhere">{user.name}</span>
        <span className="text-muted-foreground text-sm wrap-anywhere">
          {user.email}
        </span>
      </span>
    </span>
  );
}
