"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/error-state";

interface QueryStateProps<T> {
  children: (data: T) => ReactNode;
  errorTitle?: string;
  query: UseQueryResult<T>;
  /** Shown until the first answer, usually a skeleton shaped like the content. */
  skeleton: ReactNode;
}

/**
 * The skeleton, the error with a retry, or the content, for one query. A
 * refetch that fails keeps the data shown, along with any dialog or form open
 * in it. The content decides its own empty state, since only it knows what
 * empty means.
 */
export function QueryState<T>({
  query,
  skeleton,
  errorTitle,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) {
    return skeleton;
  }
  if (query.isLoadingError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={query.refetch}
        retrying={query.isRefetching}
        title={errorTitle}
      />
    );
  }
  return children(query.data);
}
