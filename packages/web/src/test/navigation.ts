import { vi } from "vitest";

type Params = Record<string, string | string[]>;

interface Location {
  params: Params;
  pathname: string;
  searchParams: URLSearchParams;
}

let location: Location;

/**
 * The router `useRouter` returns in component tests. Its methods record
 * calls without navigating, so assert on them:
 * `expect(router.push).toHaveBeenCalledWith("/households")`.
 */
export const router = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
};

/**
 * Where the `next/navigation` hooks say the page is, and `window.location`
 * with them. `params` are the dynamic segments, such as `householdId`.
 */
export function setNavigation(url: string, params: Params = {}): void {
  window.history.replaceState(null, "", url);
  const { pathname, search } = new URL(url, window.location.origin);
  location = { pathname, params, searchParams: new URLSearchParams(search) };
}

export function resetNavigation(): void {
  setNavigation("/");
  for (const method of Object.values(router)) {
    method.mockReset();
  }
}

resetNavigation();

/** Replaces the `next/navigation` hooks, which need the App Router mounted. */
export const navigationMock = {
  useParams: () => location.params,
  usePathname: () => location.pathname,
  useRouter: () => router,
  useSearchParams: () => location.searchParams,
};
