"use client";

import { CircleAlertIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/error-message";

interface ErrorStateProps {
  error: unknown;
  /** Pass the query's `refetch`; leave it out when retrying can't help. */
  onRetry?: () => unknown;
  /** True while the retry runs, such as the query's `isRefetching`. */
  retrying?: boolean;
  title?: string;
}

/** Where a failed query's data would have been. */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
  title = "Couldn't load this",
}: ErrorStateProps) {
  return (
    <Empty className="border-destructive/30 flex-none border" role="alert">
      <EmptyHeader>
        <EmptyMedia className="text-destructive" variant="icon">
          <CircleAlertIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button
            disabled={retrying}
            onClick={() => onRetry()}
            variant="outline"
          >
            {retrying ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RotateCwIcon aria-hidden data-icon="inline-start" />
            )}
            Try again
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
