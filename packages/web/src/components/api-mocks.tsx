"use client";

import { type ReactNode, useEffect, useState } from "react";

// The condition is written out in full wherever the mocks load, so production
// builds, where `NODE_ENV` is "production", drop them as dead code, and so
// server bundles, where `typeof window` is "undefined", never resolve the
// browser-only `msw/browser`.

/**
 * With `NEXT_PUBLIC_API_MOCKS=true` in `next dev`, start the mock API and
 * render the app once it intercepts requests. Otherwise renders the app at once.
 */
export function ApiMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(
    !(
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_API_MOCKS === "true"
    )
  );

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_API_MOCKS === "true"
    ) {
      import("@/mocks/browser")
        .then(({ startMocks }) => startMocks())
        .catch((error: unknown) => {
          console.error("[mocks] Couldn't start the mock API", error);
        })
        .finally(() => setReady(true));
    }
  }, []);

  return ready ? children : null;
}
