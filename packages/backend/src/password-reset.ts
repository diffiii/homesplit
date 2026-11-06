import { isIP } from "node:net";
import { APIError } from "better-auth/api";
import type { Email } from "./mail";
import { RateLimiter } from "./rate-limiter";

/** The header that carries the visitor's address. Better Auth reads it too. */
export const VISITOR_IP_HEADER = "x-forwarded-for";

export const PASSWORD_RESET_SUBJECT = "Reset your HomeSplit password";

/** See "Better Auth endpoints" in docs/decisions.md. */
export const PASSWORD_RESET = {
  /** How long a reset link works. */
  linkTtlSeconds: 60 * 60,
  /** The period the limits below apply to. */
  windowSeconds: 60 * 60,
  /** Reset requests one visitor address may make. */
  maxRequestsPerIp: 10,
  /** Reset requests without a usable visitor address may make, all together. */
  maxRequestsWithoutAddress: 60,
  /** Reset emails one address may be sent. */
  maxEmailsPerAddress: 3,
  /** Keys each limiter remembers; the least recently used go first. */
  maxTrackedKeys: 10_000,
} as const;

const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const WINDOW_MS = PASSWORD_RESET.windowSeconds * MS_PER_SECOND;
const NO_ADDRESS = "no-address";

const requestsByIp = new RateLimiter({
  max: PASSWORD_RESET.maxRequestsPerIp,
  maxKeys: PASSWORD_RESET.maxTrackedKeys,
  windowMs: WINDOW_MS,
});

// One shared bucket, so a request can't escape the limit by hiding its address.
const requestsWithoutAddress = new RateLimiter({
  max: PASSWORD_RESET.maxRequestsWithoutAddress,
  maxKeys: 1,
  windowMs: WINDOW_MS,
});

const emailsByAddress = new RateLimiter({
  max: PASSWORD_RESET.maxEmailsPerAddress,
  maxKeys: PASSWORD_RESET.maxTrackedKeys,
  windowMs: WINDOW_MS,
});

// `/forget-password` is the older name of the same endpoint.
const REQUEST_PATHS = new Set(["/request-password-reset", "/forget-password"]);

export function isPasswordResetRequest(path: string): boolean {
  return REQUEST_PATHS.has(path);
}

/**
 * The visitor's address, or undefined when the header is missing, lists
 * several hops, or isn't an IP address.
 */
function visitorIp(headers: Headers | undefined): string | undefined {
  const value = headers?.get(VISITOR_IP_HEADER)?.trim();
  return value && isIP(value) !== 0 ? value.toLowerCase() : undefined;
}

/**
 * Throws 429 `RATE_LIMITED` when this address has made too many reset
 * requests. Requests without a usable address share one limit instead of
 * escaping it. The limit doesn't depend on the email, so it can't reveal which
 * emails have accounts.
 */
export function assertResetRequestAllowed(headers: Headers | undefined): void {
  const ip = visitorIp(headers);
  const allowed = ip
    ? requestsByIp.tryConsume(ip)
    : requestsWithoutAddress.tryConsume(NO_ADDRESS);

  if (!allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      code: "RATE_LIMITED",
      message: "Too many password reset requests. Try again later.",
    });
  }
}

/** Whether another reset email may go to this address now. */
export function mayEmailResetLink(email: string): boolean {
  return emailsByAddress.tryConsume(email.toLowerCase());
}

/** A path on the frontend: one `/` and then anything but another `/` or `\`. */
function isFrontendPath(value: string): boolean {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
  );
}

/**
 * The link to the frontend's reset page, which carries the token and, when
 * the page asked for one, where to continue. `authUrl` is the `url` Better Auth
 * passes to `sendResetPassword`; its `callbackURL` is the page's `redirectTo`,
 * or missing, or the text "undefined", when the page sent none.
 */
export function resetLink(
  frontendUrl: string,
  token: string,
  authUrl: string
): string {
  const url = new URL("/reset-password", frontendUrl);
  url.searchParams.set("token", token);
  const redirectTo = new URL(authUrl).searchParams.get("callbackURL");
  if (redirectTo && isFrontendPath(redirectTo)) {
    url.searchParams.set("redirectTo", redirectTo);
  }
  return url.toString();
}

export function passwordResetEmail(to: string, link: string): Email {
  const hours = PASSWORD_RESET.linkTtlSeconds / SECONDS_PER_HOUR;
  const lifetime = hours === 1 ? "1 hour" : `${hours} hours`;
  const ignore =
    "If you didn't ask for this, ignore this email and your password stays as it is.";

  return {
    to,
    subject: PASSWORD_RESET_SUBJECT,
    text: `Open this link to choose a new password for HomeSplit:\n\n${link}\n\nThe link works for ${lifetime}. ${ignore}`,
    html: `<p>Open this link to choose a new password for HomeSplit:</p><p><a href="${link}">Choose a new password</a></p><p>The link works for ${lifetime}. ${ignore}</p>`,
  };
}
