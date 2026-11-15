import { mailer } from "@/auth";
import { LogMailer } from "@/log-mailer";
import type { Email } from "@/mail";
import { PASSWORD_RESET_SUBJECT } from "@/password-reset";

export const VERIFICATION_SUBJECT = "Verify your email for HomeSplit";

const URL_IN_TEXT = /https?:\/\/\S+/u;

/** What the test app's mailer would have sent, oldest first. */
export function sentEmails(): Email[] {
  if (!(mailer instanceof LogMailer)) {
    throw new Error("Tests expect MAIL_DRIVER=log");
  }
  return mailer.sent;
}

function emailsTo(to: string, subject: string): Email[] {
  return sentEmails().filter(
    (email) => email.to === to && email.subject === subject
  );
}

export function verificationEmails(to: string): Email[] {
  return emailsTo(to, VERIFICATION_SUBJECT);
}

/**
 * The link in the newest verification email to `to`, a frontend page, and
 * `path`, the Better Auth call that page makes with its token. Without a
 * `callbackURL`, the call answers JSON and sets the session cookie instead of
 * redirecting.
 */
export function verificationLink(to: string): { path: string; url: URL } {
  const href = verificationEmails(to).at(-1)?.text.match(URL_IN_TEXT)?.[0];
  if (!href) {
    throw new Error(`No verification email sent to ${to}`);
  }
  const url = new URL(href);
  const token = url.searchParams.get("token") ?? "";
  return {
    path: `/api/auth/verify-email?${new URLSearchParams({ token })}`,
    url,
  };
}

export function passwordResetEmails(to: string): Email[] {
  return emailsTo(to, PASSWORD_RESET_SUBJECT);
}

/** The link in the newest password reset email to `to`. */
export function passwordResetLink(to: string): URL {
  const href = passwordResetEmails(to).at(-1)?.text.match(URL_IN_TEXT)?.[0];
  if (!href) {
    throw new Error(`No password reset email sent to ${to}`);
  }
  return new URL(href);
}
