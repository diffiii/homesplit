import { describe, expect, it } from "vitest";
import {
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
