"use client";

import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";
import { QuickAdd } from "./quick-add";
import { QuickAddSheet } from "./quick-add-sheet";
import { ShoppingList } from "./shopping-list";

export default function ShoppingPage() {
  const enabled = useFeatureEnabled("shopping");
  return (
    <>
      <PageHeader
        actions={enabled ? <QuickAddSheet /> : null}
        className="flex-row items-center justify-between"
        title="Shopping"
      />
      {enabled ? (
        <div className="hidden md:block">
          <QuickAdd />
        </div>
      ) : (
        <ModuleDisabledAlert module="Shopping" />
      )}
      <ShoppingList />
    </>
  );
}
