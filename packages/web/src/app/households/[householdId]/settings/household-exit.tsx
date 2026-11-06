"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useHousehold,
  useHouseholdId,
  usePermissions,
} from "@/components/shell/household-context";
import { balancesPath } from "@/components/shell/household-nav";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isApiRequestError } from "@/lib/api/api-error";
import { households } from "@/lib/api/auth-client";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { householdQueries } from "@/lib/api/household-queries";
import { queryKeys } from "@/lib/api/query-keys";
import { landingPath } from "@/lib/last-household";

/**
 * After leaving or deleting: take the household out of the switcher, and go to
 * another household, or to the first-run screen without one. Its cached data
 * goes once the page has unmounted: the shell would refetch it sooner, get a
 * 404, and show "not found" before the navigation lands.
 */
function useExitHousehold() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const router = useRouter();
  const exited = useRef<boolean>(false);
  useEffect(
    () => () => {
      if (exited.current) {
        queryClient.removeQueries({
          queryKey: queryKeys.household(householdId),
        });
      }
    },
    [householdId, queryClient]
  );
  return async () => {
    exited.current = true;
    const list = householdQueries.list().queryKey;
    queryClient.setQueryData(list, (current) =>
      current?.filter(({ id }) => id !== householdId)
    );
    await queryClient.invalidateQueries({ queryKey: list });
    const remaining = queryClient.getQueryData(list) ?? [];
    router.replace(
      landingPath(
        remaining.map(({ id }) => id),
        null
      )
    );
  };
}

/** A conflict's explanation, with a link to where the user can clear it. */
function SettleUpMessage({ children }: { children: ReactNode }) {
  const householdId = useHouseholdId();
  return (
    <>
      {children}{" "}
      <Link
        className="hover:text-foreground underline underline-offset-4"
        href={balancesPath(householdId)}
      >
        Go to balances
      </Link>
      .
    </>
  );
}

export function LeaveHousehold() {
  const householdId = useHouseholdId();
  const can = usePermissions();
  const exit = useExitHousehold();
  const hintId = useId();
  return (
    <section aria-labelledby="leave-heading" className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id="leave-heading">
        Leave household
      </h2>
      <p className="text-muted-foreground text-sm" id={hintId}>
        {can.leaveHousehold
          ? "You'll lose access, but your history stays for the others."
          : "You're the last owner, so you can't leave yet. Make someone else an owner under Members first, or delete the household."}
      </p>
      <div>
        {can.leaveHousehold ? (
          <ConfirmDialog
            confirmLabel="Leave"
            describeError={describeLeaveError}
            description="You can only come back if someone invites you again."
            destructive
            onConfirm={async () => {
              await households.leave({ householdId });
              await exit();
            }}
            title="Leave this household?"
            trigger={
              <Button variant="destructive">
                <LogOutIcon aria-hidden data-icon="inline-start" />
                Leave household
              </Button>
            }
          />
        ) : (
          <Button aria-describedby={hintId} disabled variant="destructive">
            <LogOutIcon aria-hidden data-icon="inline-start" />
            Leave household
          </Button>
        )}
      </div>
    </section>
  );
}

function describeLeaveError(error: unknown): ReactNode {
  if (!isApiRequestError(error)) {
    return errorMessage(error);
  }
  switch (error.code) {
    case "UNSETTLED_BALANCE":
      return (
        <SettleUpMessage>
          Settle up first: you can't leave while you owe or are owed money here.
        </SettleUpMessage>
      );
    // The other owner stepped down after this page loaded.
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
      return "You're the last owner. Make someone else an owner first.";
    default:
      return errorMessage(error);
  }
}

/** Only owners see it, and they confirm by typing the household's name. */
export function DeleteHousehold() {
  const { household } = useHousehold();
  const can = usePermissions();
  const exit = useExitHousehold();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  if (!can.deleteHousehold) {
    return null;
  }
  const name = household.name.trim();
  return (
    <section aria-labelledby="delete-heading" className="flex flex-col gap-3">
      <h2 className="text-base font-medium" id="delete-heading">
        Delete household
      </h2>
      <p className="text-muted-foreground text-sm">
        This removes it for everyone, and only works once all balances are zero.
      </p>
      <div>
        <ConfirmDialog
          confirmDisabled={typed.trim() !== name}
          confirmLabel="Delete household"
          describeError={describeDeleteError}
          description="Its expenses, payments, chores, and shopping lists are deleted for everyone. This can't be undone."
          destructive
          onConfirm={async () => {
            await api("deleteHousehold", {
              params: { householdId: household.id },
            });
            await exit();
          }}
          onOpenChange={(open) => {
            if (!open) {
              setTyped("");
            }
          }}
          title={`Delete “${name}”?`}
          trigger={
            <Button variant="destructive">
              <Trash2Icon aria-hidden data-icon="inline-start" />
              Delete household
            </Button>
          }
        >
          <Field>
            <FieldLabel htmlFor={inputId}>Type “{name}” to confirm</FieldLabel>
            <Input
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              id={inputId}
              onChange={(event) => setTyped(event.target.value)}
              spellCheck={false}
              value={typed}
            />
          </Field>
        </ConfirmDialog>
      </div>
    </section>
  );
}

function describeDeleteError(error: unknown): ReactNode {
  return isApiRequestError(error) &&
    error.code === "HOUSEHOLD_HAS_UNSETTLED_BALANCES" ? (
    <SettleUpMessage>
      Everyone's balances must be zero first, including people who left.
    </SettleUpMessage>
  ) : (
    errorMessage(error)
  );
}
