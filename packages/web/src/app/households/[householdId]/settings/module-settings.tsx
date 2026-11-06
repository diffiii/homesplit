"use client";

import type { FeatureId } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListChecksIcon,
  type LucideIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import {
  useFeatureEnabled,
  useHouseholdId,
  usePermissions,
} from "@/components/shell/household-context";
import { balancesPath } from "@/components/shell/household-nav";
import { Switch } from "@/components/ui/switch";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { endpointQuery } from "@/lib/api/queries";

interface Module {
  feature: FeatureId;
  hint: string;
  icon: LucideIcon;
  label: string;
}

const READ_ONLY = "Turning it off makes it read-only and deletes nothing.";

const MODULES: readonly Module[] = [
  {
    feature: "expenses",
    label: "Expenses",
    icon: ReceiptIcon,
    hint: `Split costs, see balances, and settle up. ${READ_ONLY}`,
  },
  {
    feature: "chores",
    label: "Chores",
    icon: ListChecksIcon,
    hint: `Share recurring tasks and see who's next. ${READ_ONLY}`,
  },
  {
    feature: "shopping",
    label: "Shopping",
    icon: ShoppingCartIcon,
    hint: `Keep one shopping list for everyone. ${READ_ONLY}`,
  },
  {
    feature: "ai",
    label: "AI",
    icon: SparklesIcon,
    hint: "Suggest categories and read receipts. While it's on, receipt photos and expense text are sent to an AI provider; turning it off stops that.",
  },
];

/** Turn modules on and off; everyone sees the flags, admins change them. */
export function ModuleSettings() {
  const can = usePermissions();
  return (
    <section aria-labelledby="modules-heading" className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id="modules-heading">
        Modules
      </h2>
      <p className="text-muted-foreground text-sm">
        {can.updateFeatures
          ? "Choose what this household uses."
          : "What this household uses. Only admins and owners can change it."}
      </p>
      <ul className="flex flex-col divide-y rounded-xl border">
        {MODULES.map((module) => (
          <ModuleRow
            editable={can.updateFeatures}
            key={module.feature}
            module={module}
          />
        ))}
      </ul>
    </section>
  );
}

function ModuleRow({
  module: { feature, label, icon: Icon, hint },
  editable,
}: {
  editable: boolean;
  module: Module;
}) {
  const householdId = useHouseholdId();
  const enabled = useFeatureEnabled(feature);
  const queryClient = useQueryClient();
  const id = useId();
  const update = useMutation({
    mutationFn: (next: boolean) =>
      api("updateHouseholdFeatures", {
        params: { householdId },
        body: { [feature]: next },
      }),
    // The shell reads this query, so the nav and every module screen follow at once.
    onSuccess: (features) =>
      queryClient.setQueryData(
        endpointQuery("getHouseholdFeatures", { params: { householdId } })
          .queryKey,
        features
      ),
  });
  // Show where the switch is going while the request runs; a failure puts it back.
  const checked = update.isPending ? update.variables : enabled;

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <Icon aria-hidden className="text-muted-foreground mt-0.5 size-5" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium" id={`${id}-label`}>
            {label}
          </span>
          <p className="text-muted-foreground text-sm" id={`${id}-hint`}>
            {hint}
          </p>
        </div>
        <span aria-hidden className="text-muted-foreground text-sm">
          {checked ? "On" : "Off"}
        </span>
        <Switch
          aria-describedby={`${id}-hint`}
          aria-labelledby={`${id}-label`}
          checked={checked}
          disabled={!editable || update.isPending}
          onCheckedChange={(next) => update.mutate(next)}
        />
      </div>
      {update.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {isApiRequestError(update.error) &&
          update.error.code === "HOUSEHOLD_HAS_UNSETTLED_BALANCES" ? (
            <>
              Expenses stay on while anyone owes or is owed money, so everyone
              can still settle up.{" "}
              <Link
                className="hover:text-foreground underline underline-offset-4"
                href={balancesPath(householdId)}
              >
                Settle the balances first
              </Link>
              .
            </>
          ) : (
            errorMessage(update.error)
          )}
        </p>
      ) : null}
    </li>
  );
}
