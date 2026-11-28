import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
  HOME_PATH,
  isPublicPath,
  isSignedOutPath,
  SIGNED_IN_HOME_PATH,
  signInUrl,
} from "@/lib/api/session";

/**
 * Send visitors without a session cookie to sign-in before a signed-in page
 * renders. The check is optimistic: a cookie whose session has expired gets
 * through, and the first API call's 401 redirects instead. Signed-in users
 * aren't sent away from signed-out pages, because a stale cookie would then
 * bounce between sign-in and the app.
 *
 * `/` is the landing page without a cookie and the signed-in home with one,
 * so the installed app, which starts at `/`, opens straight into a household.
 * Public pages, such as the privacy policy, open either way.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  if (pathname === HOME_PATH) {
    return hasSession
      ? NextResponse.rewrite(
          new URL(`${SIGNED_IN_HOME_PATH}${search}`, request.url)
        )
      : NextResponse.next();
  }
  if (isSignedOutPath(pathname) || isPublicPath(pathname) || hasSession) {
    return NextResponse.next();
  }
  return NextResponse.redirect(
    new URL(signInUrl(`${pathname}${search}`), request.url)
  );
}

export const config = {
  // Pages only: not the `/api/*` rewrite, Next.js assets, files like the
  // manifest, the iOS home screen icon and the shared link image, which have
  // no extension, or the development-only `/dev/*` pages, which need no backend.
  matcher: [
    "/((?!api/|_next/|dev/|apple-icon$|opengraph-image$|.*\\.[^/]*$).*)",
  ],
};
