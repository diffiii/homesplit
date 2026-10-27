import type { UserSummary } from "@homesplit/contracts";
import { cn } from "cn";
import { LogOutIcon } from "lucide-react";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/initials";

type AvatarUser = Pick<UserSummary, "name" | "imageUrl">;

interface UserAvatarProps {
  className?: string;
  /** Hide it from screen readers when the name is right next to it. */
  decorative?: boolean;
  /** The user has left the household; their history still shows them. */
  departed?: boolean;
  size?: "sm" | "default" | "lg";
  user: AvatarUser;
}

/** The user's picture, or their initials while it loads or when there's none. */
export function UserAvatar({
  user,
  size = "default",
  departed = false,
  decorative = false,
  className,
}: UserAvatarProps) {
  const label = departed ? `${user.name} (left the household)` : user.name;
  return (
    <Avatar
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cn(departed && "opacity-60 grayscale", className)}
      role={decorative ? undefined : "img"}
      size={size}
    >
      {user.imageUrl ? <AvatarImage alt="" src={user.imageUrl} /> : null}
      {/* The kit's muted text falls short of 4.5:1 contrast on the muted fill. */}
      <AvatarFallback className="text-foreground">
        {initials(user.name)}
      </AvatarFallback>
      {departed ? (
        <AvatarBadge className="bg-muted-foreground">
          <LogOutIcon aria-hidden />
        </AvatarBadge>
      ) : null}
    </Avatar>
  );
}

interface UserLabelProps {
  departed?: boolean;
  size?: UserAvatarProps["size"];
  user: AvatarUser;
}

/** Avatar and name, as payers, assignees, and members are listed. */
export function UserLabel({ user, departed = false, size }: UserLabelProps) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <UserAvatar decorative departed={departed} size={size} user={user} />
      <span className={cn("truncate", departed && "text-muted-foreground")}>
        {user.name}
      </span>
      {departed ? (
        <Badge className="shrink-0" variant="outline">
          Left the household
        </Badge>
      ) : null}
    </span>
  );
}
