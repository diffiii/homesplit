import { Resend } from "resend";

const MAX_CAPTURED_EMAILS = 100;
const DEFAULT_MAIL_FROM = "HomeSplit <onboarding@resend.dev>";

// Captured messages for local development and tests.
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
  const { NODE_ENV, RESEND_API_KEY, MAIL_FROM, E2E } = process.env;

  if (
    NODE_ENV === "test" ||
    NODE_ENV === "development" ||
    E2E === "true" ||
    RESEND_API_KEY?.startsWith("re_dummy")
  ) {
    capturedEmails.push({ to, subject, html });

    if (capturedEmails.length > MAX_CAPTURED_EMAILS) {
      capturedEmails.splice(0, capturedEmails.length - MAX_CAPTURED_EMAILS);
    }

    console.log(`[Mail Captured] Subject: ${subject} -> To: ${to}`);

    return { success: true, captured: true };
  }

  if (!RESEND_API_KEY) {
    throw new Error("missing RESEND_API_KEY");
  }

  const { data, error } = await new Resend(RESEND_API_KEY).emails.send({
    from: MAIL_FROM || DEFAULT_MAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }

  return data;
}
