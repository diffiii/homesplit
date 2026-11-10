import type { Email } from "@/mail";
import { sentEmails } from "./mail";

const URL_IN_TEXT = /https?:\/\/\S+/u;
const INVITATION_PATH = "/invitations/";

/** The invitation emails to `to`, oldest first. */
export function invitationEmails(to: string): Email[] {
  return sentEmails().filter(
    (email) => email.to === to && email.text.includes(INVITATION_PATH)
  );
}

/** The link in the newest invitation email to `to`, and the ID it carries. */
export function invitationLink(to: string): { id: string; url: URL } {
  const href = invitationEmails(to).at(-1)?.text.match(URL_IN_TEXT)?.[0];
  if (!href) {
    throw new Error(`No invitation email sent to ${to}`);
  }
  const url = new URL(href);
  return { id: url.pathname.split("/").pop() ?? "", url };
}
