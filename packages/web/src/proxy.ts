import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isSignedOutPath, signInUrl } from "@/lib/api/session";

/**
 * Send visitors without a session cookie to sign-in before a signed-in page
 * renders. The check is optimistic: a cookie whose session has expired gets
 * through, and the first API call's 401 redirects instead. Signed-in users
 * aren't sent away from signed-out pages, because a stale cookie would then
 * bounce between sign-in and the app.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isSignedOutPath(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(
    new URL(signInUrl(`${pathname}${search}`), request.url)
  );
}

export const config = {
  // Pages only: not the `/api/*` rewrite, Next.js assets, files like the
  // manifest, the iOS home screen icon, which has no extension, or the
  // development-only `/dev/*` pages, which need no backend.
  matcher: ["/((?!api/|_next/|dev/|apple-icon$|.*\\.[^/]*$).*)"],
};
