import { afterEach, describe, expect, it, vi } from "vitest";

import { capturedEmails, sendEmail } from "@/mail";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const message = {
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
};

afterEach(() => {
  vi.unstubAllEnvs();
  send.mockReset();
  capturedEmails.length = 0;
});

describe("sendEmail", () => {
  it.each(["test", "development"])(
    "captures messages instead of sending them in %s",
    async (env) => {
      vi.stubEnv("NODE_ENV", env);

      const result = await sendEmail(message);

      expect(result).toEqual({ success: true, captured: true });
      expect(capturedEmails).toEqual([message]);
      expect(send).not.toHaveBeenCalled();
    }
  );

  it("keeps only the most recent captured messages", () => {
    vi.stubEnv("NODE_ENV", "test");

    for (let i = 0; i < 105; i += 1) {
      // sendEmail is synchronous in test environment when capturing
      sendEmail({ ...message, subject: `Message ${i}` });
    }

    expect(capturedEmails).toHaveLength(100);
    expect(capturedEmails[0]?.subject).toBe("Message 5");
    expect(capturedEmails.at(-1)?.subject).toBe("Message 104");
  });

  it("fails in production without RESEND_API_KEY", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(sendEmail(message)).rejects.toThrow("missing RESEND_API_KEY");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends through Resend in production with the default sender", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "");
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });

    const result = await sendEmail(message);

    expect(result).toEqual({ id: "email-1" });
    expect(send).toHaveBeenCalledWith({
      from: "HomeSplit <onboarding@resend.dev>",
      ...message,
    });
  });

  it("throws when Resend returns an error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    send.mockResolvedValue({ data: null, error: { message: "rate limited" } });

    await expect(sendEmail(message)).rejects.toThrow(
      "Failed to send email via Resend: rate limited"
    );
  });
});
