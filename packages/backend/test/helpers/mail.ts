import { expect, vi } from "vitest";
import { capturedEmails } from "@/mail";

export const VERIFY_SUBJECT = "Verify your email address";

export const verificationEmails = (email: string) =>
  capturedEmails.filter(
    (mail) => mail.to === email && mail.subject === VERIFY_SUBJECT
  );

// Better Auth may send in the background, so wait instead of asserting at once.
export function waitForVerificationEmails(
  email: string,
  count: number
): Promise<void> {
  return vi.waitFor(() => {
    expect(verificationEmails(email)).toHaveLength(count);
  });
}

/** The newest verification link for `email`, as a path the test app can serve. */
export function verificationLink(email: string): { path: string; url: URL } {
  const html = verificationEmails(email).at(-1)?.html;
  const href = html?.match(/href="([^"]+)"/u)?.[1];
  if (!href) {
    throw new Error(`No verification email captured for ${email}`);
  }
  const url = new URL(href.replaceAll("&amp;", "&"));
  // Without callbackURL, Better Auth answers JSON and sets the cookie
  // instead of redirecting.
  url.searchParams.delete("callbackURL");
  return { path: `${url.pathname}${url.search}`, url };
}
