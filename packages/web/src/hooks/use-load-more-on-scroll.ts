import { useEffect, useRef } from "react";

/** Start the next page before the user reaches the end of the list. */
const PRELOAD_MARGIN = "400px";

/**
 * Attach the returned ref to a list's "Load more" button: the next page loads
 * when the button nears the viewport, and the button still works by hand.
 */
export function useLoadMoreOnScroll({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}) {
  const loadMore = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = loadMore.current;
    if (
      !(button && hasNextPage) ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: PRELOAD_MARGIN }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return loadMore;
}
