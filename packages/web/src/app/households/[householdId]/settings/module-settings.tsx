"use client";

import type { FeatureId } from "@homesplit/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId } from "react";
import {
  useFeatureEnabled,
  useHouseholdId,
  usePermissions,
} from "@/components/shell/household-context";
import {
  HOUSEHOLD_NAV,
  householdPath,
  type NavItem,
} from "@/components/shell/household-nav";
import { Switch } from "@/components/ui/switch";
import { isApiRequestError } from "@/lib/api/api-error";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { endpointQuery } from "@/lib/api/queries";

const PURPOSE: Record<FeatureId, string> = {
  expenses: "Split costs, see balances, and settle up.",
  chores: "Share recurring tasks and see who's next.",
  shopping: "Keep one shopping list for everyone.",
};

const MODULES = HOUSEHOLD_NAV.filter(
  (item): item is NavItem & { feature: FeatureId } => item.feature !== undefined
);

/** Turn expenses, chores, and shopping on and off; everyone sees the flags, admins change them. */
export function ModuleSettings() {
  const can = usePermissions();
  return (
    <section aria-labelledby="modules-heading" className="flex flex-col gap-3">
      <h2 className="font-medium text-base" id="modules-heading">
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
  module: { feature, label, icon: Icon },
  editable,
}: {
  editable: boolean;
  module: NavItem & { feature: FeatureId };
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
        <Icon aria-hidden className="mt-0.5 size-5 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium text-sm" id={`${id}-label`}>
            {label}
          </span>
          <p className="text-muted-foreground text-sm" id={`${id}-hint`}>
            {PURPOSE[feature]} Turning it off makes it read-only and deletes
            nothing.
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
                className="underline underline-offset-4 hover:text-foreground"
                href={householdPath(householdId, "expenses")}
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
