/** How long a verification link works, the backend's `emailVerification.expiresIn`. */
export const VERIFICATION_LINK_HOURS = 24;

/** How long the resend button waits after sending, so a click can't send a burst. */
export const RESEND_COOLDOWN_SECONDS = 60;

const BASE64URL_DASH = /-/gu;
const BASE64URL_UNDERSCORE = /_/gu;

/**
 * The address a verification token is for. Better Auth's tokens are JWTs with
 * the email in their payload; this reads it without checking the signature,
 * only to offer sending a new link there. Empty for anything else.
 */
export function emailInToken(token: string | null): string {
  const payload = token?.split(".")[1];
  if (!payload) {
    return "";
  }
  try {
    // `atob` gives one character per byte; the JSON inside is UTF-8.
    const bytes = Uint8Array.from(
      atob(
        payload.replace(BASE64URL_DASH, "+").replace(BASE64URL_UNDERSCORE, "/")
      ),
      (char) => char.charCodeAt(0)
    );
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const email =
      typeof json === "object" && json !== null && "email" in json
        ? json.email
        : undefined;
    return typeof email === "string" ? email : "";
  } catch {
    return "";
  }
}
