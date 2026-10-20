"use client";

import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { useHouseholdId } from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { UserLabel } from "@/components/user-avatar";
import { householdQueries } from "@/lib/api/household-queries";

/** Placeholder overview: the dashboard epic replaces it with balances, chores, and shopping. */
export default function HouseholdOverviewPage() {
  const householdId = useHouseholdId();
  const members = useQuery(householdQueries.members(householdId));

  return (
    <>
      <PageHeader description="Who lives here." title="Overview" />
      <section
        aria-labelledby="members-heading"
        className="flex flex-col gap-3"
      >
        <h2 className="font-medium text-base" id="members-heading">
          Members
        </h2>
        <QueryState
          query={members}
          skeleton={<ListSkeleton label="Loading members" rows={3} />}
        >
          {(data) =>
            data.length === 0 ? (
              <EmptyState icon={UsersIcon} title="No members" />
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {data.map((member) => (
                  <li
                    className="flex items-center gap-3 px-4 py-3"
                    key={member.id}
                  >
                    <span className="min-w-0 flex-1">
                      <UserLabel
                        user={{
                          name: member.user.name,
                          imageUrl: member.user.image ?? null,
                        }}
                      />
                    </span>
                    <Badge className="capitalize" variant="secondary">
                      {member.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
    </>
  );
}
