"use client";

import { UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useHousehold } from "@/components/shell/household-context";
import { Badge } from "@/components/ui/badge";
import { UserLabel } from "@/components/user-avatar";

/** Placeholder overview: the dashboard epic replaces it with balances, chores, and shopping. */
export default function HouseholdOverviewPage() {
  const { members } = useHousehold();

  return (
    <>
      <PageHeader description="Who lives here." title="Overview" />
      <section
        aria-labelledby="members-heading"
        className="flex flex-col gap-3"
      >
        <h2 className="text-base font-medium" id="members-heading">
          Members
        </h2>
        {members.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No members" />
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {members.map((member) => (
              <li className="flex items-center gap-3 px-4 py-3" key={member.id}>
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
        )}
      </section>
    </>
  );
}
