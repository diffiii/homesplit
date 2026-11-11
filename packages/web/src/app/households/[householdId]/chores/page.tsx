"use client";

import type { Chore } from "@homesplit/contracts";
import { PlusIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ModuleDisabledAlert } from "@/components/module-disabled-alert";
import { PageHeader } from "@/components/page-header";
import { useFeatureEnabled } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { parseChoreFilters } from "@/lib/chores";
import { ChoreDialog } from "./chore-dialog";
import { ChoreViewPicker, CompletedToggle } from "./chore-filters";
import { ChoreList } from "./chore-list";

export default function ChoresPage() {
  const enabled = useFeatureEnabled("chores");
  const search = useSearchParams();
  const filters = useMemo(
    () => parseChoreFilters(new URLSearchParams(search.toString())),
    [search]
  );
  const [dialog, setDialog] = useState<{ chore: Chore | null; key: number }>({
    chore: null,
    key: 0,
  });
  const [editOpen, setEditOpen] = useState(false);
  const openDialog = (chore: Chore | null) => {
    setDialog(({ key }) => ({ chore, key: key + 1 }));
    setEditOpen(true);
  };
  const addButton = enabled ? (
    <Button onClick={() => openDialog(null)}>
      <PlusIcon aria-hidden data-icon="inline-start" />
      Add chore
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        actions={addButton}
        className="flex-row items-center justify-between"
        title="Chores"
      />
      {enabled ? null : <ModuleDisabledAlert module="Chores" />}
      <ChoreViewPicker filters={filters} />
      <ChoreList
        emptyAction={addButton}
        filters={filters}
        onEdit={enabled ? openDialog : undefined}
      />
      <CompletedToggle filters={filters} />
      <ChoreDialog
        chore={dialog.chore}
        formKey={dialog.key}
        onOpenChange={setEditOpen}
        open={editOpen}
      />
    </>
  );
}
