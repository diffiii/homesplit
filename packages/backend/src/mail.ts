import { z } from "zod";
import { LogMailer } from "./log-mailer";
import { ResendMailer } from "./resend-mailer";

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
