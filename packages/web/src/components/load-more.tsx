"use client";

import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLoadMoreOnScroll } from "@/hooks/use-load-more-on-scroll";

interface LoadMoreProps {
  /** Singular and plural, such as `["expense", "expenses"]`. */
  noun: readonly [string, string];
  query: Pick<
    UseInfiniteQueryResult,
    | "fetchNextPage"
    | "hasNextPage"
    | "isFetchingNextPage"
    | "isFetchNextPageError"
  >;
  shown: number;
  total: number;
}

/**
 * The end of an infinite list: how much is shown, and the next page as it
 * scrolls into view. A button does the same for keyboard and screen reader
 * users, and wherever the observer isn't available.
 */
export function LoadMore({ query, shown, total, noun }: LoadMoreProps) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useLoadMoreOnScroll(query);

  return (
    <div className="flex flex-col items-center gap-2">
      <p aria-live="polite" className="text-muted-foreground text-sm">
        Showing {shown} of {total} {total === 1 ? noun[0] : noun[1]}
      </p>
      {hasNextPage ? (
        <Button
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          ref={loadMore}
          variant="outline"
        >
          {isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
          Load more
        </Button>
      ) : null}
      {query.isFetchNextPageError ? (
        <p className="text-destructive text-sm" role="alert">
          Couldn't load more {noun[1]}. Try again.
        </p>
      ) : null}
    </div>
  );
}
