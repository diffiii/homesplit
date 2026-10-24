"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { NotFoundPage } from "@/components/not-found-page";
import { queryKeys } from "@/lib/api/query-keys";

/** For a household that doesn't exist, or that the user isn't in, or no longer. */
export function HouseholdNotFound() {
  const queryClient = useQueryClient();
  // The list may still hold a household the user has just left or been removed from.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.households() });
  }, [queryClient]);

  return (
    <NotFoundPage
      description="It doesn't exist, or you're not a member of it anymore. Someone in it can invite you again."
      title="Household not found"
    />
  );
}
