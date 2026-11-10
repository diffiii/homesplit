import { INVITATION_EXPIRY_DAYS } from "@homesplit/contracts";
import { APIError } from "better-auth/api";
import type { Email } from "./mail";
import { RateLimiter } from "./rate-limiter";

/** See "Better Auth endpoints" in docs/decisions.md. */
export const INVITATION = {
  /** How long an invitation can be accepted, as the web also says. */
  expiresInSeconds: INVITATION_EXPIRY_DAYS * 24 * 60 * 60,
  /** The period the limits below apply to. */
  windowSeconds: 60 * 60,
  /** Invitation emails one user may trigger, new or sent again. */
  maxPerSender: 30,
  /** Invitation emails one address may be sent, whoever sends them. */
  maxPerRecipient: 5,
  /** Keys each limiter remembers; the least recently used go first. */
  maxTrackedKeys: 10_000,
} as const;

const SECONDS_PER_DAY = 24 * 60 * 60;
const MS_PER_SECOND = 1000;
const WINDOW_MS = INVITATION.windowSeconds * MS_PER_SECOND;
const HTML_SPECIAL = /[&<>"']/gu;
const WHITESPACE = /\s+/gu;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const bySender = new RateLimiter({
  max: INVITATION.maxPerSender,
  maxKeys: INVITATION.maxTrackedKeys,
  windowMs: WINDOW_MS,
});

const byRecipient = new RateLimiter({
  max: INVITATION.maxPerRecipient,
  maxKeys: INVITATION.maxTrackedKeys,
  windowMs: WINDOW_MS,
});

/**
 * Throws 429 `RATE_LIMITED` when this user has sent too many invitation emails,
 * or this address has been sent too many by anyone. It runs before Better Auth
 * writes anything, and counts every request of a signed-in user, even one
 * Better Auth then refuses. A request without a session or an email address is
 * left to Better Auth.
 */
export function assertInvitationAllowed(
  senderId: string | undefined,
  recipient: unknown
): void {
  if (!senderId || typeof recipient !== "string") {
    return;
  }
  if (
    !(
      bySender.tryConsume(senderId) &&
      byRecipient.tryConsume(recipient.trim().toLowerCase())
    )
  ) {
    throw new APIError("TOO_MANY_REQUESTS", {
      code: "RATE_LIMITED",
      message: "Too many invitations. Try again later.",
    });
  }
}

function escapeHtml(text: string): string {
  return text.replace(HTML_SPECIAL, (char) => HTML_ESCAPES[char] ?? char);
}

/** Names are user input; in a subject they stay on one line. */
function oneLine(text: string): string {
  return text.replace(WHITESPACE, " ").trim();
}

/** The link to the frontend's invitation page, which carries the invitation ID. */
export function invitationLink(
  frontendUrl: string,
  invitationId: string
): string {
  return new URL(
    `/invitations/${encodeURIComponent(invitationId)}`,
    frontendUrl
  ).toString();
}

export interface InvitationEmailInput {
  household: string;
  inviter: string;
  link: string;
  to: string;
}

export function invitationEmail({
  to,
  household,
  inviter,
  link,
}: InvitationEmailInput): Email {
  const days = INVITATION.expiresInSeconds / SECONDS_PER_DAY;
  const lifetime = days === 1 ? "1 day" : `${days} days`;

  return {
    to,
    subject: `${oneLine(inviter)} invited you to ${oneLine(household)} on HomeSplit`,
    text: `${inviter} invited you to join the household "${household}" on HomeSplit.\n\nOpen this link and sign in or sign up with this email address to join:\n\n${link}\n\nThe invitation works for ${lifetime}. If you don't know ${inviter}, ignore this email.`,
    html: `<p><strong>${escapeHtml(inviter)}</strong> invited you to join the household <strong>${escapeHtml(household)}</strong> on HomeSplit.</p><p><a href="${escapeHtml(link)}">Join the household</a></p><p>Sign in or sign up with this email address to join. The invitation works for ${lifetime}. If you don't know ${escapeHtml(inviter)}, ignore this email.</p>`,
  };
}
