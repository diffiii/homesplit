import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoadMoreOnScroll } from "./use-load-more-on-scroll";

let observers: { callback: IntersectionObserverCallback }[] = [];

const scrollToButton = () => {
  for (const { callback } of observers) {
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
  }
};

function List(props: Parameters<typeof useLoadMoreOnScroll>[0]) {
  const ref = useLoadMoreOnScroll(props);
  return <button ref={ref} type="button" />;
}

const state = {
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
};

describe("useLoadMoreOnScroll", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observers.push({ callback });
        }
        readonly observe = vi.fn();
        readonly disconnect = vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the next page when the button comes near", () => {
    const fetchNextPage = vi.fn();
    render(<List {...state} fetchNextPage={fetchNextPage} />);

    scrollToButton();

    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("doesn't start another request while one is running", () => {
    const fetchNextPage = vi.fn();
    render(
      <List {...state} fetchNextPage={fetchNextPage} isFetchingNextPage />
    );

    scrollToButton();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("leaves retrying a failed page to the button, instead of looping", () => {
    const fetchNextPage = vi.fn();
    render(
      <List {...state} fetchNextPage={fetchNextPage} isFetchNextPageError />
    );

    expect(observers).toEqual([]);
    scrollToButton();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
