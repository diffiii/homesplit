"use client";

import { ListChecksIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useHouseholdId } from "@/components/shell/household-context";
import { useFeatureEnabled } from "@/hooks/use-household-features";

export default function ChoresPage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled(householdId, "chores");
  return (
    <>
      <PageHeader title="Chores" />
      {!enabled && <ModuleDisabledAlert module="Chores" />}
      <EmptyState
        description="This screen arrives with its own epic."
        icon={ListChecksIcon}
        title="Nothing here yet"
      />
    </>
  );
}
