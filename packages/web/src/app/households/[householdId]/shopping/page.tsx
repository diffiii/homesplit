"use client";

import { ShoppingCartIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useHouseholdId } from "@/components/shell/household-context";
import { useFeatureEnabled } from "@/hooks/use-household-features";

export default function ShoppingPage() {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled(householdId, "shopping");
  return (
    <>
      <PageHeader title="Shopping" />
      {!enabled && <ModuleDisabledAlert module="Shopping" />}
      <EmptyState
        description="This screen arrives with its own epic."
        icon={ShoppingCartIcon}
        title="Nothing here yet"
      />
    </>
  );
}
