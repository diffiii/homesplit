"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  LayoutGridIcon,
  LogOutIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useRequiredSession } from "@/hooks/use-required-session";
import { signOut } from "@/lib/api/auth-client";
import { householdQueries } from "@/lib/api/household-queries";
import { getQueryClient } from "@/lib/api/query-client";
import { SIGN_IN_PATH } from "@/lib/api/session";
import { HouseholdContext } from "./household-context";
import { HOUSEHOLD_NAV, householdPath, isActive } from "./household-nav";

interface HouseholdShellProps {
  children: ReactNode;
  householdId: string;
}

/**
 * Frame of every `/households/:householdId/...` page: a sidebar from `md` up,
 * and a top bar with bottom navigation on phones.
 */
export function HouseholdShell({ householdId, children }: HouseholdShellProps) {
  return (
    <HouseholdContext value={householdId}>
      <SidebarProvider>
        <a
          className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-3 focus:ring-ring/50"
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
            {children}
          </main>
        </div>
        <BottomNav householdId={householdId} />
      </SidebarProvider>
    </HouseholdContext>
  );
}

function useHouseholds() {
  return useQuery(householdQueries.list());
}

/** Modules turned off for the household; their sections stay reachable but read-only. */
function useDisabledFeatures(householdId: string): ReadonlySet<string> {
  const { data } = useHouseholdFeatures(householdId);
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur md:hidden">
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
                  "flex h-16 flex-col items-center justify-center gap-1 font-medium text-muted-foreground text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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

function HouseholdSwitcher({ householdId }: { householdId: string }) {
  const { data } = useHouseholds();
  const current = data?.find((household) => household.id === householdId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="w-full min-w-0 justify-between px-2 font-semibold"
            size="lg"
            variant="ghost"
          />
        }
      >
        <span className="truncate">{current?.name ?? "Household"}</span>
        <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Households</DropdownMenuLabel>
          {data?.map((household) => (
            <DropdownMenuItem
              key={household.id}
              render={<Link href={householdPath(household.id)} />}
            >
              <span className="flex-1 truncate">{household.name}</span>
              {household.id === householdId ? (
                <CheckIcon aria-label="Current" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/" />}>
          <LayoutGridIcon aria-hidden />
          All households
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            aria-label={showName ? undefined : "Account"}
            className={cn(showName && "min-w-0 flex-1 justify-start px-1")}
            size={showName ? "lg" : "icon"}
            variant="ghost"
          />
        }
      >
        <UserAvatar decorative size="sm" user={summary} />
        {showName ? <span className="truncate">{user.name}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={signOutAndReset}>
            <LogOutIcon aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sign out, then drop everything cached for this user before showing sign-in. */
async function signOutAndReset() {
  await signOut();
  getQueryClient().clear();
  window.location.assign(SIGN_IN_PATH);
}
