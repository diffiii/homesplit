"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, HouseIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateHouseholdDialog } from "@/components/create-household-dialog";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { householdPath } from "@/components/shell/household-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeMenu } from "@/components/theme-menu";
import { Button } from "@/components/ui/button";
import { householdQueries } from "@/lib/api/household-queries";

/** Households the user belongs to, and the first-run screen without any. */
export default function HouseholdsPage() {
  const list = useQuery(householdQueries.list());
  const [createOpen, setCreateOpen] = useState(false);
  const createButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <PlusIcon aria-hidden data-icon="inline-start" />
      New household
    </Button>
  );

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-end gap-1 px-2">
        <ThemeMenu />
        <UserMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-10"
        id="main"
      >
        <PageHeader
          actions={list.data?.length ? createButton : undefined}
          title="Your households"
        />
        <QueryState
          query={list}
          skeleton={<ListSkeleton label="Loading households" rows={3} />}
        >
          {(data) =>
            data.length === 0 ? (
              <EmptyState
                action={createButton}
                description={
                  <>
                    Create one and invite the people you live with.
                    <span className="mt-3 block">
                      Joining an existing household? Ask an owner or admin to
                      invite you, then open the invitation link and sign in with
                      the email address they invited.
                    </span>
                  </>
                }
                icon={HouseIcon}
                title="No households yet"
              />
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {data.map((household) => (
                  <li key={household.id}>
                    <Link
                      className="hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-3 outline-none focus-visible:ring-3"
                      href={householdPath(household.id)}
                    >
                      <HouseIcon
                        aria-hidden
                        className="text-muted-foreground size-5"
                      />
                      <span className="flex-1 truncate font-medium">
                        {household.name}
                      </span>
                      <ChevronRightIcon
                        aria-hidden
                        className="text-muted-foreground size-4"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </main>
      <CreateHouseholdDialog onOpenChange={setCreateOpen} open={createOpen} />
    </div>
  );
}
