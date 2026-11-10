import { toast } from "sonner";
import { account } from "./api/auth-client";
import { getQueryClient } from "./api/query-client";
import { pauseSignInRedirects, signInUrl } from "./api/session";

/**
 * Sign out, drop everything cached for this user, and show sign-in, which
 * continues to `redirectTo` once someone signs in again, as when switching
 * accounts. If the request fails, the user stays signed in and on the page,
 * since sign-in would only send them back.
 */
export async function signOutAndReset({
  redirectTo,
}: {
  redirectTo?: string;
} = {}): Promise<void> {
  // Ending the session makes `useRequiredSession` want to come back here.
  const resume = pauseSignInRedirects();
  try {
    await account.signOut();
  } catch {
    resume();
    toast.error("Couldn't sign out. Check your connection and try again.", {
      id: "sign-out-failed",
    });
    return;
  }
  getQueryClient().clear();
  window.location.replace(signInUrl(redirectTo));
}
