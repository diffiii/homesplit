import type { Email } from "./mail";

/** See "Better Auth endpoints" in docs/decisions.md. */
export const INVITATION = {
  /** How long an invitation can be accepted. */
  expiresInSeconds: 7 * 24 * 60 * 60,
} as const;

const SECONDS_PER_DAY = 24 * 60 * 60;
const HTML_SPECIAL = /[&<>"']/gu;
const WHITESPACE = /\s+/gu;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

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
