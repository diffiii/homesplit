"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/api/auth-client";
import { redirectToSignIn } from "@/lib/api/session";

/**
 * The Better Auth session, for pages that need a signed-in user. Once the
 * check finds no session, it sends the user to sign-in. A failed check, such
 * as a network error, is returned in `error` instead.
 */
export function useRequiredSession() {
  const session = useSession();
  const signedOut = !(session.isPending || session.error || session.data);

  useEffect(() => {
    if (signedOut) {
      redirectToSignIn();
    }
  }, [signedOut]);

  return session;
}
