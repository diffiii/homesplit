import { Resend } from "resend";

const { RESEND_API_KEY, MAIL_FROM } = process.env;
const mailFromAddress = MAIL_FROM || "HomeSplit <onboarding@resend.dev>";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Capturing test mails
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
  if (
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "development" ||
    !resend
  ) {
    capturedEmails.push({ to, subject, html });
    console.log(`[Mail Captured] To: ${to} | Subject: ${subject}`);
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
