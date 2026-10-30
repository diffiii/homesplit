import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

function Providers({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
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

  return {
    ...render(ui, {
      wrapper: ({ children }) => (
        <Providers queryClient={queryClient}>{children}</Providers>
      ),
    }),
    queryClient,
    user: userEvent.setup(),
  };
}
