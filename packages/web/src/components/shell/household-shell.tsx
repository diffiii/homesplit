"use client";

import { matchQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { useRequiredSession } from "@/hooks/use-required-session";
import { isApiRequestError } from "@/lib/api/api-error";
import {
  householdQueries,
  isHouseholdNotFound,
} from "@/lib/api/household-queries";
import { endpointQuery } from "@/lib/api/queries";
import { queryKeys } from "@/lib/api/query-keys";
import { ACCOUNT_PATH } from "@/lib/api/session";
import { rememberHousehold } from "@/lib/last-household";
import { strongestRole } from "@/lib/permissions";
import { signOutAndReset } from "@/lib/sign-out";
import { HouseholdContext, type HouseholdData } from "./household-context";
import { HOUSEHOLD_NAV, householdPath, isActive } from "./household-nav";
import { HouseholdNotFound } from "./household-not-found";
import { HouseholdSwitcher } from "./household-switcher";

interface HouseholdShellProps {
  children: ReactNode;
  householdId: string;
}

const featuresQuery = (householdId: string) =>
  endpointQuery("getHouseholdFeatures", { params: { householdId } });

type HouseholdState =
  | { status: "ready"; data: HouseholdData }
  | { status: "pending" }
  | { status: "not-found" }
  | {
      status: "error";
      error: unknown;
      retry: () => unknown;
      retrying: boolean;
    };

/**
 * The household, its members, its module flags, and the caller's role,
 * loaded once for every page under it. A refetch that fails keeps the data
 * shown, unless it says the caller isn't a member anymore.
 */
function useHouseholdState(householdId: string): HouseholdState {
  const session = useRequiredSession();
  const household = useQuery(householdQueries.get(householdId));
  const features = useQuery(featuresQuery(householdId));
  const userId = session.data?.user.id;
  const member = household.data?.members.find(
    (candidate) => candidate.userId === userId
  );
  const role = member ? strongestRole(member.role) : null;

  const data = useMemo<HouseholdData | null>(
    () =>
      household.data && features.data && userId && role
        ? {
            household: household.data,
            members: household.data.members,
            features: features.data,
            userId,
            role,
          }
        : null,
    [household.data, features.data, userId, role]
  );

  if (
    isHouseholdNotFound(household.error) ||
    isHouseholdNotFound(features.error) ||
    (household.data && userId && !role)
  ) {
    return { status: "not-found" };
  }
  if (data) {
    return { status: "ready", data };
  }
  if (session.error) {
    return {
      status: "error",
      error: session.error,
      retry: session.refetch,
      retrying: session.isRefetching,
    };
  }
  const failed = [household, features].find(
    (query) => query.isError && query.data === undefined
  );
  if (failed) {
    return {
      status: "error",
      error: failed.error,
      retry: failed.refetch,
      retrying: failed.isRefetching,
    };
  }
  return { status: "pending" };
}

/**
 * Check the membership again whenever a request for this household answers
 * 404, as every household route does once the caller has left or been
 * removed, so the not-found page replaces the shell.
 */
function useRecheckMembershipOn404(householdId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const scope = { queryKey: queryKeys.household(householdId) };
    const recheck = (error: unknown) => {
      if (isApiRequestError(error) && error.status === 404) {
        queryClient.invalidateQueries({
          queryKey: householdQueries.get(householdId).queryKey,
        });
      }
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "error" &&
        matchQuery(scope, event.query)
      ) {
        recheck(event.action.error);
      }
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        recheck(event.action.error);
      }
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [householdId, queryClient]);
}

/**
 * Frame of every `/households/:householdId/...` page: a sidebar from `md` up,
 * and a top bar with bottom navigation on phones. Pages render once the
 * household has loaded, and read it from `useHousehold`.
 */
export function HouseholdShell({ householdId, children }: HouseholdShellProps) {
  const state = useHouseholdState(householdId);
  useRecheckMembershipOn404(householdId);
  const ready = state.status === "ready";

  // Signing in opens this household again next time.
  useEffect(() => {
    if (ready) {
      rememberHousehold(householdId);
    }
  }, [householdId, ready]);

  if (state.status === "not-found") {
    return <HouseholdNotFound />;
  }

  return (
    <SidebarProvider>
      <a
        className="bg-background focus:ring-ring/50 sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-3"
        href="#main"
      >
        Skip to content
      </a>
      <DesktopSidebar householdId={householdId} />
      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <MobileTopBar householdId={householdId} />
        <main
          className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-10"
          id="main"
          tabIndex={-1}
        >
          {state.status === "ready" ? (
            <HouseholdContext value={state.data}>{children}</HouseholdContext>
          ) : null}
          {state.status === "pending" ? (
            <ListSkeleton label="Loading household" rows={3} />
          ) : null}
          {state.status === "error" ? (
            <ErrorState
              error={state.error}
              onRetry={state.retry}
              retrying={state.retrying}
              title="Couldn't load this household"
            />
          ) : null}
        </main>
      </div>
      <BottomNav householdId={householdId} />
    </SidebarProvider>
  );
}

/** Modules turned off for the household; their sections stay reachable but read-only. */
function useDisabledFeatures(householdId: string): ReadonlySet<string> {
  const { data } = useQuery(featuresQuery(householdId));
  return new Set(
    Object.entries(data ?? {})
      .filter(([, enabled]) => !enabled)
      .map(([feature]) => feature)
  );
}

function DesktopSidebar({ householdId }: { householdId: string }) {
  const pathname = usePathname();
  const disabled = useDisabledFeatures(householdId);
  return (
    <Sidebar
      className="sticky top-0 hidden h-svh border-r md:flex"
      collapsible="none"
    >
      <SidebarHeader>
        <HouseholdSwitcher householdId={householdId} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Household">
              <SidebarMenu>
                {HOUSEHOLD_NAV.map(
                  ({ segment, label, icon: Icon, feature }) => {
                    const active = isActive(pathname, householdId, segment);
                    return (
                      <SidebarMenuItem key={segment}>
                        <SidebarMenuButton
                          aria-current={active ? "page" : undefined}
                          isActive={active}
                          render={
                            <Link href={householdPath(householdId, segment)} />
                          }
                        >
                          <Icon aria-hidden />
                          <span>{label}</span>
                        </SidebarMenuButton>
                        {feature && disabled.has(feature) ? (
                          <SidebarMenuBadge>Off</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  }
                )}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center justify-between">
        <UserMenu showName />
        <ThemeMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileTopBar({ householdId }: { householdId: string }) {
  return (
    <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-2 backdrop-blur md:hidden">
      <div className="min-w-0 flex-1">
        <HouseholdSwitcher householdId={householdId} />
      </div>
      <ThemeMenu />
      <UserMenu />
    </header>
  );
}

function BottomNav({ householdId }: { householdId: string }) {
  const pathname = usePathname();
  const disabled = useDisabledFeatures(householdId);
  return (
    <nav
      aria-label="Household"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {HOUSEHOLD_NAV.map(({ segment, label, icon: Icon, feature }) => {
          const active = isActive(pathname, householdId, segment);
          const off = feature !== undefined && disabled.has(feature);
          return (
            <li key={segment}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground focus-visible:ring-ring/50 flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium outline-none focus-visible:ring-3",
                  active && "text-primary"
                )}
                href={householdPath(householdId, segment)}
              >
                <Icon
                  aria-hidden
                  className={cn("size-5", off && "opacity-50")}
                />
                {label}
                {off ? <span className="sr-only">(turned off)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function UserMenu({ showName = false }: { showName?: boolean }) {
  const { data } = useRequiredSession();
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
          <DropdownMenuItem onClick={signOutAndReset}>
            <LogOutIcon aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
