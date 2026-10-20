"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/api/auth-client";

/**
 * Leave a signed-out page for `target` once the session check finds the user
 * signed in. The proxy can't do this, because it sees only the cookie, which
 * may belong to an expired session.
 */
export function useRedirectIfSignedIn(target: string): void {
  const signedIn = Boolean(useSession().data);

  useEffect(() => {
    if (signedIn) {
      window.location.replace(target);
    }
  }, [signedIn, target]);
}
