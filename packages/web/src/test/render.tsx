import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/api/query-client";
import { setNavigation } from "./navigation";

export interface RenderOptions {
  /** Dynamic route segments for `useParams`, such as `{ householdId }`. */
  params?: Record<string, string | string[]>;
  /** The page's path and query, for the `next/navigation` hooks and `window.location`. */
  url?: string;
}

/**
 * Render `ui` inside the app's providers, with a query cache of its own that
 * doesn't retry, so a failure shows at once. Requests go to the mock API.
 * Returns Testing Library's result, a `user` to interact through, and the
 * `queryClient`.
 */
export function renderWithProviders(
  ui: ReactElement,
  { url = "/", params = {} }: RenderOptions = {}
) {
  setNavigation(url, params);
  const queryClient = makeQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Providers }),
    queryClient,
    user: userEvent.setup(),
  };
}
