"use client";

import { cn } from "cn";
import { LogOutIcon, UserIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { useRequiredSession } from "@/hooks/use-required-session";
import {
  describeRequestCount,
  useIncomingFriendRequestCount,
} from "@/lib/api/friend-queries";
import { ACCOUNT_PATH, FRIENDS_PATH } from "@/lib/api/session";
import { signOutAndReset } from "@/lib/sign-out";

/** The signed-in user's avatar, opening account links and sign-out. */
export function UserMenu({ showName = false }: { showName?: boolean }) {
  const { data } = useRequiredSession();
  const requests = useIncomingFriendRequestCount();
  const user = data?.user;
  if (!user) {
    return <div className={cn("size-8", showName && "flex-1")} />;
  }
  const summary = { name: user.name, imageUrl: user.image ?? null };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn(showName && "min-w-0 flex-1 justify-start px-1")}
            size={showName ? "lg" : "icon"}
            variant="ghost"
          />
        }
      >
        <UserAvatar decorative size="sm" user={summary} />
        {/* Not `aria-label`, which would have to contain the visible initials. */}
        {showName ? (
          <span className="truncate">{user.name}</span>
        ) : (
          <span className="sr-only">Account</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuItem render={<Link href={ACCOUNT_PATH} />}>
            <UserIcon aria-hidden />
            Account settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={FRIENDS_PATH} />}>
            <UsersIcon aria-hidden />
            Friends
            {requests > 0 ? (
              <>
                <span className="sr-only">
                  , {describeRequestCount(requests)}
                </span>
                <span
                  aria-hidden
                  className="bg-primary text-primary-foreground ml-auto h-5 min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums"
                >
                  {requests}
                </span>
              </>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOutAndReset()}>
            <LogOutIcon aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
