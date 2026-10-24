"use client";

import { ShoppingCartIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";

export default function ShoppingPage() {
  const enabled = useFeatureEnabled("shopping");
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
