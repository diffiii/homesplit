import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import {
  assertInvitationAllowed,
  INVITATION,
  invitationEmail,
  invitationLink,
} from "./household-invitations";

const FRONTEND = "https://homesplit.test";
const ID = "9f1c2a7e-5b0d-4d7e-8a53-0c1f2e3d4b5a";
const SECONDS_PER_DAY = 24 * 60 * 60;
const LINE_BREAK = /[\r\n]/u;

describe("invitationLink", () => {
  it("links to the invitation page on the frontend", () => {
    expect(invitationLink(FRONTEND, ID)).toBe(`${FRONTEND}/invitations/${ID}`);
  });
});

describe("invitationEmail", () => {
  const link = invitationLink(FRONTEND, ID);
  const base = {
    to: "bob@example.com",
    household: "The Flat",
    inviter: "Alice",
    link,
  };

  it("names the inviter and the household and carries the link", () => {
    const email = invitationEmail(base);

    expect(email.to).toBe("bob@example.com");
    expect(email.subject).toBe("Alice invited you to The Flat on HomeSplit");
    expect(email.text).toContain("Alice");
    expect(email.text).toContain("The Flat");
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
  });

  it("says how long the invitation works", () => {
    const days = INVITATION.expiresInSeconds / SECONDS_PER_DAY;

    expect(invitationEmail(base).text).toContain(`${days} days`);
  });

  it("escapes names in the HTML and keeps them as they are in the text", () => {
    const email = invitationEmail({
      ...base,
      household: `<script>alert(1)</script> & "co"`,
      inviter: "Tom <b>",
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;"
    );
    expect(email.html).toContain("Tom &lt;b&gt;");
    expect(email.text).toContain(`<script>alert(1)</script> & "co"`);
  });

  it("keeps the subject on one line", () => {
    const email = invitationEmail({
      ...base,
      household: "Line one\r\nBcc: someone@example.com",
    });

    expect(email.subject).not.toMatch(LINE_BREAK);
  });
});

describe("assertInvitationAllowed", () => {
  const sender = () => `sender-${randomUUID()}`;
  const guest = (n: number) => `guest-${randomUUID()}-${n}@example.com`;

  it("lets a sender invite up to the limit, then refuses", () => {
    const id = sender();
    for (let i = 0; i < INVITATION.maxPerSender; i += 1) {
      assertInvitationAllowed(id, guest(i));
    }

    expect(() => assertInvitationAllowed(id, guest(-1))).toThrow(APIError);
  });

  it("limits an address whoever sends to it, ignoring case", () => {
    const address = `Guest-${randomUUID()}@Example.com`;
    for (let i = 0; i < INVITATION.maxPerRecipient; i += 1) {
      assertInvitationAllowed(
        sender(),
        i % 2 === 0 ? address : address.toLowerCase()
      );
    }

    expect(() => assertInvitationAllowed(sender(), address)).toThrow(APIError);
  });

  it("doesn't charge an address for a sender who is over the limit", () => {
    const id = sender();
    const address = guest(0);
    for (let i = 0; i < INVITATION.maxPerSender; i += 1) {
      assertInvitationAllowed(id, guest(i + 1));
    }
    expect(() => assertInvitationAllowed(id, address)).toThrow(APIError);

    for (let i = 0; i < INVITATION.maxPerRecipient; i += 1) {
      assertInvitationAllowed(sender(), address);
    }
  });

  it("leaves a request without a sender or an address to Better Auth", () => {
    expect(() =>
      assertInvitationAllowed(undefined, "a@example.com")
    ).not.toThrow();
    expect(() => assertInvitationAllowed(sender(), undefined)).not.toThrow();
    expect(() => assertInvitationAllowed(sender(), 42)).not.toThrow();
  });
});
