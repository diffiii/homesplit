import { Resend } from "resend";
import type { Email, Mailer } from "./mail";

/** Sends through Resend, the production transport. */
export class ResendMailer implements Mailer {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async send(email: Email): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      ...email,
    });
    if (error) {
      throw new Error(`Resend rejected the email: ${error.message}`);
    }
  }
}
