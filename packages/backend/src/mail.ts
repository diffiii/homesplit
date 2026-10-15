import { Logger } from "@nestjs/common";
import { Resend } from "resend";

const { MAIL_FROM, NODE_ENV, RESEND_API_KEY } = process.env;

// Better Auth catches and only logs errors from its email callbacks, so a
// missing key would surface as users who never get an email. Refuse to start.
if (NODE_ENV === "production" && !RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}

const mailFromAddress = MAIL_FROM || "HomeSplit <onboarding@resend.dev>";

// Tests always capture. Elsewhere, without a key, emails are captured and
// their links logged, so local sign-ups can still be verified.
const resend =
  RESEND_API_KEY && NODE_ENV !== "test" ? new Resend(RESEND_API_KEY) : null;

const logger = new Logger("Mail");

const MAX_CAPTURED_EMAILS = 100;

const HREFS = /href="([^"]+)"/g;

// Captured messages for local tests.
export const capturedEmails: Array<{
  to: string;
  subject: string;
  html: string;
}> = [];

interface SendEmailOptions {
  html: string;
  subject: string;
  to: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  if (!resend) {
    capturedEmails.push({ to, subject, html });

    if (capturedEmails.length > MAX_CAPTURED_EMAILS) {
      capturedEmails.splice(0, capturedEmails.length - MAX_CAPTURED_EMAILS);
    }

    if (NODE_ENV !== "test") {
      const links = Array.from(html.matchAll(HREFS), ([, href]) => href);
      logger.log(`Captured "${subject}" to ${to}: ${links.join(" ")}`);
    }

    return { success: true, captured: true };
  }

  const { data, error } = await resend.emails.send({
    from: mailFromAddress,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }

  return data;
}
