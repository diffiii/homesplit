export const SIGN_IN_PATH = "/sign-in";

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
