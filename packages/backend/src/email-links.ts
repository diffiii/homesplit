/** Frontend pages that emails link to (docs/decisions.md, "Email links"). */
export const VERIFY_EMAIL_PATH = "/verify-email";
export const RESET_PASSWORD_PATH = "/reset-password";

/** A path on the frontend: one `/` and then anything but another `/` or `\`. */
function isFrontendPath(value: string): boolean {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
  );
}

/**
 * The link to a frontend page, which carries the token and, when the page
 * asked for one, where to continue. `authUrl` is the `url` Better Auth passes
 * to its email callback; its `callbackURL` is the page's `redirectTo`, or
 * missing, or the text "undefined", when the page sent none.
 */
export function emailLink(
  frontendUrl: string,
  path: string,
  token: string,
  authUrl: string
): string {
  const url = new URL(path, frontendUrl);
  url.searchParams.set("token", token);
  const redirectTo = new URL(authUrl).searchParams.get("callbackURL");
  if (redirectTo && isFrontendPath(redirectTo)) {
    url.searchParams.set("redirectTo", redirectTo);
  }
  return url.toString();
}
