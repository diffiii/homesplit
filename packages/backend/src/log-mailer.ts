import { Logger } from "@nestjs/common";
import type { Email, Mailer } from "./mail";

const MAX_LOGGED_EMAILS = 100;

/**
 * Logs each message, links included, instead of sending it, so a developer
 * can follow them locally. Keeps the latest ones in `sent` for tests.
 */
export class LogMailer implements Mailer {
  /** The latest messages, oldest first. */
  readonly sent: Email[] = [];
  private readonly logger = new Logger("Mail");

  send(email: Email): Promise<void> {
    this.sent.push(email);
    if (this.sent.length > MAX_LOGGED_EMAILS) {
      this.sent.shift();
    }
    this.logger.log(`To ${email.to}: ${email.subject}\n${email.text}`);
    return Promise.resolve();
  }
}
