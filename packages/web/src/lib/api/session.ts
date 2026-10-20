export const SIGN_IN_PATH = "/sign-in";

/**
 * Pages for signed-out visitors. Every other page needs a session, and the
 * proxy sends visitors without one to sign-in before the page renders.
 */
export const SIGNED_OUT_PATHS: ReadonlySet<string> = new Set([
  SIGN_IN_PATH,
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

export function isSignedOutPath(pathname: string): boolean {
  return SIGNED_OUT_PATHS.has(pathname);
}

/** The sign-in page, continuing to `redirectTo` once the user is signed in. */
export function signInUrl(redirectTo: string): string {
  return `${SIGN_IN_PATH}?${new URLSearchParams({ redirectTo })}`;
}

let redirecting = false;

/**
 * Send the browser to sign-in, coming back to the current page afterwards.
 * Does nothing on the server, on the sign-in page, or while already leaving.
 */
export function redirectToSignIn(): void {
  if (typeof window === "undefined" || redirecting) {
    return;
  }
  const { pathname, search } = window.location;
  if (pathname === SIGN_IN_PATH) {
    return;
  }
  redirecting = true;
  window.location.assign(signInUrl(`${pathname}${search}`));
}

/**
 * Where to go after signing in: `redirectTo` if it's a path on this origin,
 * starting with a single `/`, and `/` otherwise, so a link can't send the user
 * to another site.
 */
export function safeRedirectPath(
  redirectTo: string | null | undefined
): string {
  if (
    !redirectTo?.startsWith("/") ||
    redirectTo.startsWith("//") ||
    redirectTo.startsWith("/\\")
  ) {
    return "/";
  }
  return redirectTo;
}
