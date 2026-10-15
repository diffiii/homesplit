import { Resend } from "resend";

const { RESEND_API_KEY, MAIL_FROM } = process.env;

const mailFromAddress = MAIL_FROM || "HomeSplit <onboarding@resend.dev>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const MAX_CAPTURED_EMAILS = 100;

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
  const isTest = process.env.NODE_ENV === "test";
  const isDevelopment = process.env.NODE_ENV === "development";

  if (isTest || isDevelopment) {
    capturedEmails.push({ to, subject, html });

    if (capturedEmails.length > MAX_CAPTURED_EMAILS) {
      capturedEmails.splice(0, capturedEmails.length - MAX_CAPTURED_EMAILS);
    }

    console.log(`[Mail Captured] Subject: ${subject}`);

    return { success: true, captured: true };
  }

  if (!resend) {
    throw new Error("Email delivery is not configured: missing RESEND_API_KEY");
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
