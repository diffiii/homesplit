"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { useHouseholdId } from "@/components/shell/household-context";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { households } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import { queryKeys } from "@/lib/api/query-keys";
import { HOUSEHOLDS_PATH } from "@/lib/last-household";
import { CategorySettings } from "./category-settings";
import { ModuleSettings } from "./module-settings";

/** Household settings: modules, categories, and leaving. The households epic adds the rest; the theme is on the account page. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <ModuleSettings />
      <CategorySettings />
      <LeaveHousehold />
    </>
  );
}

function LeaveHousehold() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const router = useRouter();
  return (
    <section aria-labelledby="leave-heading" className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id="leave-heading">
        Leave household
      </h2>
      <p className="text-muted-foreground text-sm">
        You'll lose access, but your history stays for the others.
      </p>
      <div>
        <ConfirmDialog
          confirmLabel="Leave"
          describeError={(error) =>
            isApiRequestError(error) && error.code === "UNSETTLED_BALANCE"
              ? "Settle up first: you can't leave while you owe or are owed money here."
              : errorMessage(error)
          }
          description="You can only come back if someone invites you again."
          destructive
          onConfirm={async () => {
            await households.leave({ householdId });
            queryClient.removeQueries({
              queryKey: queryKeys.household(householdId),
            });
            await queryClient.invalidateQueries({
              queryKey: queryKeys.households(),
            });
            router.replace(HOUSEHOLDS_PATH);
          }}
          title="Leave this household?"
          trigger={
            <Button variant="destructive">
              <LogOutIcon aria-hidden data-icon="inline-start" />
              Leave household
            </Button>
          }
        />
      </div>
    </section>
  );
}
