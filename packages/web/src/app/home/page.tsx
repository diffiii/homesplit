"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";
import { Spinner } from "@/components/ui/spinner";
import { useRequiredSession } from "@/hooks/use-required-session";
import { householdQueries } from "@/lib/api/household-queries";
import { landingPath, readLastHousehold } from "@/lib/last-household";

/**
 * Where signing in leads unless a page asked for another: the household last
 * opened on this device, or the first-run screen without households. The
 * proxy shows it at `/` to visitors with a session cookie, in place of the
 * landing page.
 */
export default function SignedInHomePage() {
  // Better Auth answers a stale session cookie with 401, which isn't an `/api` 401.
  useRequiredSession();
  const router = useRouter();
  const list = useQuery(householdQueries.list());
  const target = list.data
    ? landingPath(
        list.data.map((household) => household.id),
        readLastHousehold()
      )
    : undefined;

  useEffect(() => {
    if (target) {
      router.replace(target);
    }
  }, [router, target]);

  return (
    <main
      className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center px-4"
      id="main"
    >
      {list.isError ? (
        <ErrorState
          error={list.error}
          onRetry={list.refetch}
          retrying={list.isRefetching}
          title="Couldn't load your households"
        />
      ) : (
        <Spinner className="size-6 text-muted-foreground" />
      )}
    </main>
  );
}
