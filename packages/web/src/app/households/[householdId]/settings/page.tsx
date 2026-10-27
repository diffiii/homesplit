"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { useHouseholdId } from "@/components/shell/household-context";
import { THEME_OPTIONS } from "@/components/theme-menu";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { households } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import { queryKeys } from "@/lib/api/query-keys";
import { HOUSEHOLDS_PATH } from "@/lib/last-household";
import { CategorySettings } from "./category-settings";
import { ModuleSettings } from "./module-settings";

/** Household settings: modules, categories, appearance, and leaving. The households epic adds the rest. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <ModuleSettings />
      <CategorySettings />
      <Appearance />
      <LeaveHousehold />
    </>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <section
      aria-labelledby="appearance-heading"
      className="flex flex-col gap-3"
    >
      <h2 className="font-medium text-base" id="appearance-heading">
        Appearance
      </h2>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Theme</legend>
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <Button
            aria-pressed={theme === value}
            key={value}
            onClick={() => setTheme(value)}
            variant={theme === value ? "secondary" : "outline"}
          >
            <Icon aria-hidden data-icon="inline-start" />
            {label}
          </Button>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-sm">
        System follows your device's light or dark setting.
      </p>
    </section>
  );
}

function LeaveHousehold() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const router = useRouter();
  return (
    <section aria-labelledby="leave-heading" className="flex flex-col gap-3">
      <h2 className="font-medium text-base" id="leave-heading">
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
