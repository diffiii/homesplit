import { Logger } from "@nestjs/common";
import { Resend } from "resend";
import { z } from "zod";

export interface Email {
  html: string;
  subject: string;
  text: string;
  to: string;
}

export interface Mailer {
  /** Rejects when the message wasn't accepted for delivery. */
  send: (email: Email) => Promise<void>;
}

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

/** Unset and empty variables both mean "use the default". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional()
  );

const MailDriver = optional(z.enum(["resend", "log"])).default("resend");

const ResendConfig = z.object({
  RESEND_API_KEY: z.string().min(1),
  MAIL_FROM: z.string().min(1),
});

export type MailConfig =
  | { driver: "log" }
  | { driver: "resend"; apiKey: string; from: string };

export function loadMailConfig(
  env: NodeJS.ProcessEnv = process.env
): MailConfig {
  const driver = parseEnv(MailDriver, env.MAIL_DRIVER);
  if (driver === "log") {
    return { driver };
  }
  const resend = parseEnv(ResendConfig, env);
  return { driver, apiKey: resend.RESEND_API_KEY, from: resend.MAIL_FROM };
}

export function createMailer(config: MailConfig): Mailer {
  return config.driver === "log"
    ? new LogMailer()
    : new ResendMailer(config.apiKey, config.from);
}

function parseEnv<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid mail config: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
