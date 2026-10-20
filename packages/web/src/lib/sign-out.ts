import { toast } from "sonner";
import { account } from "./api/auth-client";
import { getQueryClient } from "./api/query-client";
import { pauseSignInRedirects, SIGN_IN_PATH } from "./api/session";

/**
 * Sign out, drop everything cached for this user, and show sign-in. If the
 * request fails, the user stays signed in and on the page, since sign-in
 * would only send them back.
 */
export async function signOutAndReset(): Promise<void> {
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
  window.location.replace(SIGN_IN_PATH);
}
