"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisVerticalIcon, UserMinusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useHousehold,
  usePermissions,
} from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { isApiRequestError } from "@/lib/api/api-error";
import { type HouseholdRole, households } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import type { HouseholdMember } from "@/lib/api/household-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { formatLocalDate } from "@/lib/dates";
import { strongestRole } from "@/lib/permissions";

const ROLES: readonly HouseholdRole[] = ["owner", "admin", "member"];

const ROLE_LABEL: Record<HouseholdRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const WITH_ARTICLE: Record<HouseholdRole, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};

/** Better Auth's and HomeSplit's answers to role changes and removals, explained. */
const MEMBER_ERRORS: Record<string, string> = {
  CANNOT_REMOVE_SELF:
    "You can't remove yourself. Leave the household instead, at the bottom of this page.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    "Only an owner can remove an owner, and the household's last owner can't be removed.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
    "The household needs an owner. Make someone else an owner first.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
    "Only an owner can change an owner's role or make someone an owner.",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
    "Only admins and owners can remove members.",
  MEMBER_NOT_FOUND: "They aren't a member of this household anymore.",
};

export function describeMemberError(error: unknown): string {
  return (
    (isApiRequestError(error) ? MEMBER_ERRORS[error.code] : undefined) ??
    errorMessage(error)
  );
}

const roleOf = (member: HouseholdMember): HouseholdRole =>
  strongestRole(member.role) ?? "member";

const RANK: Record<HouseholdRole, number> = { member: 0, admin: 1, owner: 2 };

/** Owners first, then admins and members, each by when they joined. */
function byRoleThenJoined(a: HouseholdMember, b: HouseholdMember): number {
  return (
    RANK[roleOf(b)] - RANK[roleOf(a)] ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/** The household's current members; admins and owners change roles and remove members. */
export function MemberSettings() {
  const { members, role } = useHousehold();
  const sorted = [...members].sort(byRoleThenJoined);
  const heading = useRef<HTMLHeadingElement>(null);

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {/* Takes focus when an action removes the control that had it. */}
        <h2
          className="text-base font-medium outline-none"
          id="members-heading"
          ref={heading}
          tabIndex={-1}
        >
          Members
        </h2>
        <p className="text-muted-foreground text-sm">
          Admins manage members, modules, and categories. Owners can also manage
          owners and delete the household.
          {role === "member"
            ? " Only admins and owners can change roles."
            : null}
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {sorted.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onFocusLost={() => heading.current?.focus()}
          />
        ))}
      </ul>
    </section>
  );
}

type Pending = { kind: "role"; role: HouseholdRole } | { kind: "remove" };

function MemberRow({
  member,
  onFocusLost,
}: {
  member: HouseholdMember;
  /** Moves focus to the list, for when the row or its menu goes away. */
  onFocusLost: () => void;
}) {
  const { household, userId } = useHousehold();
  const can = usePermissions();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const role = roleOf(member);
  const self = member.userId === userId;
  const { name } = member.user;
  const allowedRoles = ROLES.filter((next) => can.changeRole(member, next));
  const removable = can.removeMember(member);
  const manageable = allowedRoles.length > 0 || removable;
  const trigger = useRef<HTMLButtonElement>(null);

  // Demoting yourself can take your own menu away; focus mustn't fall to the page.
  const wasManageable = useRef(manageable);
  useEffect(() => {
    if (wasManageable.current && !manageable) {
      const focused = document.activeElement;
      if (!focused || focused === document.body) {
        onFocusLost();
      }
    }
    wasManageable.current = manageable;
  }, [manageable, onFocusLost]);
  const restoreFocus = () => trigger.current ?? onFocusLost();

  // Roles may have changed elsewhere, so the list is refetched after a failure too.
  const refetchHousehold = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.household(household.id),
    });

  const changeRole = useMutation({
    mutationFn: (next: HouseholdRole) =>
      households.updateMemberRole({
        householdId: household.id,
        memberId: member.id,
        role: next,
      }),
    onSuccess: (_, next) =>
      toast.success(
        self
          ? `You're now ${WITH_ARTICLE[next]}.`
          : `${name} is now ${WITH_ARTICLE[next]}.`
      ),
    onSettled: refetchHousehold,
  });

  const remove = async () => {
    try {
      await households.removeMember({
        householdId: household.id,
        memberId: member.id,
      });
    } finally {
      await refetchHousehold();
    }
    toast.success(`${name} was removed from the household.`);
    onFocusLost();
  };

  /** Granting owner can't be undone by admins, and demoting yourself can't be undone by you. */
  const needsConfirmation = (next: HouseholdRole) =>
    next === "owner" || (self && RANK[next] < RANK[role]);

  const pickRole = (next: HouseholdRole) => {
    changeRole.reset();
    if (needsConfirmation(next)) {
      setConfirming({ kind: "role", role: next });
    } else {
      changeRole.mutate(next);
    }
  };

  const joined = formatLocalDate(new Date(member.createdAt));

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <UserAvatar
          decorative
          user={{ name, imageUrl: member.user.image ?? null }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Wraps rather than truncates, so long names and emails stay readable. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="font-medium wrap-anywhere">{name}</span>
            {self ? (
              <Badge className="shrink-0" variant="outline">
                You
              </Badge>
            ) : null}
          </span>
          <span className="text-muted-foreground text-sm wrap-anywhere">
            {member.user.email}
          </span>
          <span className="text-muted-foreground text-sm">Joined {joined}</span>
        </div>
        <Badge className="shrink-0" variant="secondary">
          {ROLE_LABEL[role]}
        </Badge>
        {manageable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={changeRole.isPending}
              render={
                <Button
                  aria-label={`Manage ${name}`}
                  ref={trigger}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <EllipsisVerticalIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {allowedRoles.length > 0 ? (
                <DropdownMenuGroup>
                  {allowedRoles.map((next) => (
                    <DropdownMenuItem key={next} onClick={() => pickRole(next)}>
                      {self ? "Make yourself" : "Make"} {WITH_ARTICLE[next]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
              {allowedRoles.length > 0 && removable ? (
                <DropdownMenuSeparator />
              ) : null}
              {removable ? (
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => setConfirming({ kind: "remove" })}
                    variant="destructive"
                  >
                    <UserMinusIcon aria-hidden />
                    Remove from household
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {changeRole.isError && confirming === null ? (
        <p className="text-destructive text-sm" role="alert">
          {describeMemberError(changeRole.error)}
        </p>
      ) : null}
      {confirming?.kind === "role" ? (
        <ConfirmDialog
          confirmLabel={`Make ${ROLE_LABEL[confirming.role].toLowerCase()}`}
          describeError={describeMemberError}
          description={roleChangeWarning(confirming.role, role, self)}
          finalFocus={restoreFocus}
          onConfirm={() => changeRole.mutateAsync(confirming.role)}
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(null);
              changeRole.reset();
            }
          }}
          open
          title={
            self
              ? `Make yourself ${WITH_ARTICLE[confirming.role]}?`
              : `Make ${name} ${WITH_ARTICLE[confirming.role]}?`
          }
        />
      ) : null}
      {confirming?.kind === "remove" ? (
        <ConfirmDialog
          confirmLabel="Remove"
          describeError={describeMemberError}
          description={`${name} loses access right away and can come back only if someone invites them again. Everything they added stays in the household, and so does any balance they have here: it can still be settled.`}
          destructive
          onConfirm={remove}
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(null);
            }
          }}
          open
          title={`Remove ${name}?`}
        />
      ) : null}
    </li>
  );
}

function roleChangeWarning(
  next: HouseholdRole,
  current: HouseholdRole,
  self: boolean
): string {
  if (!self) {
    return "Owners can do everything, including deleting the household, and only an owner can change their role again.";
  }
  return current === "owner"
    ? "You'll lose the rights of an owner here, and only another owner can give them back."
    : `You'll be ${WITH_ARTICLE[next]} and lose the rights of ${WITH_ARTICLE[current]} here. Only an admin or owner can give them back.`;
}
