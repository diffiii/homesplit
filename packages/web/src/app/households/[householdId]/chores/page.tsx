"use client";

import { ListChecksIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";

export default function ChoresPage() {
  const enabled = useFeatureEnabled("chores");
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
