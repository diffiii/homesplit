export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";

/** Where a signed-in user goes when nothing asked for another page. */
export const HOME_PATH = "/";

/** The user's profile, password, and theme. */
export const ACCOUNT_PATH = "/account";

/** The user's friends and friend requests. */
export const FRIENDS_PATH = "/friends";

/** What HomeSplit keeps, why, and who it's shared with. */
export const PRIVACY_PATH = "/privacy";

/** The terms of using HomeSplit. */
export const TERMS_PATH = "/terms";

/**
 * Pages anyone may open, signed in or not, such as the privacy policy that
 * sign-up links to. The proxy lets them through either way.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  PRIVACY_PATH,
  TERMS_PATH,
]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * The page `/` shows with a session cookie, sending the user on to a
 * household. Without one, `/` is the landing page.
 */
export const SIGNED_IN_HOME_PATH = "/home";

/**
 * Pages for signed-out visitors. Every other page needs a session, and the
 * proxy sends visitors without one to sign-in before the page renders.
 */
export const SIGNED_OUT_PATHS: ReadonlySet<string> = new Set([
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  "/verify-email",
]);

export function isSignedOutPath(pathname: string): boolean {
  return SIGNED_OUT_PATHS.has(pathname);
}

/** `page`, continuing to `redirectTo` afterwards. The home page needs no parameter. */
function withRedirect(page: string, redirectTo: string | null | undefined) {
  const target = safeRedirectPath(redirectTo);
  return target === HOME_PATH
    ? page
    : `${page}?${new URLSearchParams({ redirectTo: target })}`;
}

/** The sign-in page, continuing to `redirectTo` once the user is signed in. */
export function signInUrl(redirectTo?: string | null): string {
  return withRedirect(SIGN_IN_PATH, redirectTo);
}

/** The sign-up page, continuing to `redirectTo` once the account exists. */
export function signUpUrl(redirectTo?: string | null): string {
  return withRedirect(SIGN_UP_PATH, redirectTo);
}

/** The page that emails a reset link, which continues to `redirectTo` after the reset. */
export function forgotPasswordUrl(redirectTo?: string | null): string {
  return withRedirect(FORGOT_PASSWORD_PATH, redirectTo);
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
 * Stop `redirectToSignIn` while signing out, which ends the session on
 * purpose and goes to sign-in without a `redirectTo`. Call the returned
 * function if signing out fails.
 */
export function pauseSignInRedirects(): () => void {
  const wasRedirecting = redirecting;
  redirecting = true;
  return () => {
    redirecting = wasRedirecting;
  };
}

// Only its origin matters: a path that resolves anywhere else leaves the site.
const SAME_ORIGIN = "https://homesplit.invalid";

/**
 * Where to go after signing in: `redirectTo` if it's a path on this origin
 * other than a signed-out page, and `/` otherwise, so a link can't send the
 * user to another site. The path is resolved the way the browser will
 * resolve it, so tricks like `/\evil.test` or a tab in `/\t/evil.test` don't
 * get through.
 */
export function safeRedirectPath(
  redirectTo: string | null | undefined
): string {
  if (!redirectTo?.startsWith("/")) {
    return HOME_PATH;
  }
  let url: URL;
  try {
    url = new URL(redirectTo, SAME_ORIGIN);
  } catch {
    return HOME_PATH;
  }
  if (url.origin !== SAME_ORIGIN || isSignedOutPath(url.pathname)) {
    return HOME_PATH;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
