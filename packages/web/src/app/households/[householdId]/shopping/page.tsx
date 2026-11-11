"use client";

import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";
import { QuickAdd } from "./quick-add";
import { ShoppingList } from "./shopping-list";

export default function ShoppingPage() {
  const enabled = useFeatureEnabled("shopping");
  return (
    <>
      <PageHeader title="Shopping" />
      {enabled ? <QuickAdd /> : <ModuleDisabledAlert module="Shopping" />}
      <ShoppingList />
    </>
  );
}
