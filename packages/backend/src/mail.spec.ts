import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMailer,
  type Email,
  LogMailer,
  loadMailConfig,
  ResendMailer,
} from "./mail";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const message: Email = {
  to: "user@example.com",
  subject: "Hello",
  text: "Hi",
  html: "<p>Hi</p>",
};

const MISSING_RESEND_CONFIG = /RESEND_API_KEY[\s\S]*MAIL_FROM/;
const MISSING_SENDER = /MAIL_FROM/;
const INVALID_CONFIG = /Invalid mail config/;

afterEach(() => {
  send.mockReset();
  vi.restoreAllMocks();
});

describe("loadMailConfig", () => {
  it("needs Resend's key and a sender by default", () => {
    expect(() => loadMailConfig({})).toThrow(MISSING_RESEND_CONFIG);
    expect(() =>
      loadMailConfig({ MAIL_DRIVER: "", RESEND_API_KEY: "re_1", MAIL_FROM: "" })
    ).toThrow(MISSING_SENDER);
    expect(
      loadMailConfig({ RESEND_API_KEY: "re_1", MAIL_FROM: "a@b.test" })
    ).toEqual({ driver: "resend", apiKey: "re_1", from: "a@b.test" });
  });

  it("needs nothing else for the log driver", () => {
    expect(loadMailConfig({ MAIL_DRIVER: "log" })).toEqual({ driver: "log" });
  });

  it("rejects an unknown driver", () => {
    expect(() => loadMailConfig({ MAIL_DRIVER: "smtp" })).toThrow(
      INVALID_CONFIG
    );
  });
});

describe("ResendMailer", () => {
  const mailer = createMailer({
    driver: "resend",
    apiKey: "re_1",
    from: "HomeSplit <hello@homesplit.test>",
  });

  it("sends from the configured sender", async () => {
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await mailer.send(message);

    expect(mailer).toBeInstanceOf(ResendMailer);
    expect(send).toHaveBeenCalledWith({
      from: "HomeSplit <hello@homesplit.test>",
      ...message,
    });
  });

  it("rejects when Resend returns an error", async () => {
    send.mockResolvedValue({ data: null, error: { message: "rate limited" } });

    await expect(mailer.send(message)).rejects.toThrow(
      "Resend rejected the email: rate limited"
    );
  });
});

describe("LogMailer", () => {
  it("logs the message and keeps the latest 100 without sending them", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockReturnValue();
    const mailer = new LogMailer();

    await Promise.all(
      Array.from({ length: 105 }, (_, i) =>
        mailer.send({ ...message, subject: `Message ${i}` })
      )
    );

    expect(mailer.sent).toHaveLength(100);
    expect(mailer.sent[0]?.subject).toBe("Message 5");
    expect(mailer.sent.at(-1)?.subject).toBe("Message 104");
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenLastCalledWith(
      "To user@example.com: Message 104\nHi"
    );
  });
});
