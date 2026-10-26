"use client";

import { ReceiptIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";

export default function ExpensesPage() {
  const enabled = useFeatureEnabled("expenses");
  return (
    <>
      <PageHeader title="Expenses" />
      {enabled ? null : <ModuleDisabledAlert module="Expenses" />}
      <EmptyState
        description="This screen arrives with its own epic."
        icon={ReceiptIcon}
        title="Nothing here yet"
      />
    </>
  );
}
