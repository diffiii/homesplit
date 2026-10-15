import {
  isServer,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { isApiRequestError, NO_STATUS } from "./api-error";

const MAX_RETRIES = 2;

/**
 * Toast the errors no screen can do anything about: rate limits and server
 * failures. Every other error is left to the screen that made the call.
 */
export function notifyError(error: unknown): void {
  if (!isApiRequestError(error)) {
    return;
  }
  if (error.status === 429) {
    toast.error("Too many requests. Wait a moment and try again.", {
      id: "rate-limited",
    });
  } else if (error.status >= 500) {
    toast.error("Something went wrong on our side. Try again.", {
      id: "server-error",
    });
  }
}

/** Retry only failures that may pass on their own: no answer, or a server error. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) {
    return false;
  }
  return (
    isApiRequestError(error) &&
    (error.status === NO_STATUS || error.status >= 500)
  );
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: notifyError }),
    mutationCache: new MutationCache({ onError: notifyError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** One client per browser tab; a fresh one per server render, so users never share a cache. */
export function getQueryClient(): QueryClient {
  if (isServer) {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
