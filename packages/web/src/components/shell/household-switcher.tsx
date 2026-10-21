"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  LayoutGridIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateHouseholdDialog } from "@/components/create-household-dialog";
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
import { householdQueries } from "@/lib/api/household-queries";
import { HOUSEHOLDS_PATH } from "@/lib/last-household";
import { householdPath } from "./household-nav";

export function HouseholdSwitcher({ householdId }: { householdId: string }) {
  const list = useQuery(householdQueries.list());
  const [createOpen, setCreateOpen] = useState(false);
  const current = list.data?.find((household) => household.id === householdId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Switch household, ${current?.name ?? "Household"}`}
              className="w-full min-w-0 justify-between px-2 font-semibold"
              size="lg"
              variant="ghost"
            />
          }
        >
          <span className="truncate">{current?.name ?? "Household"}</span>
          <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-56 max-w-[calc(100vw-2rem)]"
          render={(props) => (
            <nav aria-label="Household selection">
              <div {...props} />
            </nav>
          )}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Households</DropdownMenuLabel>
            {list.status === "pending" ? (
              <DropdownMenuItem disabled>Loading households…</DropdownMenuItem>
            ) : null}
            {list.data?.map((household) => (
              <DropdownMenuItem
                aria-current={household.id === householdId ? "true" : undefined}
                key={household.id}
                render={<Link href={householdPath(household.id)} />}
              >
                <span className="flex-1 truncate">{household.name}</span>
                {household.id === householdId ? (
                  <CheckIcon aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
            {list.isError ? (
              <>
                <DropdownMenuItem disabled>
                  Couldn't load households
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={list.isRefetching}
                  onClick={() => list.refetch()}
                >
                  <RotateCwIcon aria-hidden />
                  Try again
                </DropdownMenuItem>
              </>
            ) : null}
            {list.isSuccess && list.data.length === 0 ? (
              <DropdownMenuItem disabled>No households yet</DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <PlusIcon aria-hidden />
            New household
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={HOUSEHOLDS_PATH} />}>
            <LayoutGridIcon aria-hidden />
            All households
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateHouseholdDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}
