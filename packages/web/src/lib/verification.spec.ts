import { describe, expect, it } from "vitest";
import { emailInToken } from "./verification";

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("emailInToken", () => {
  it("reads the email from a JWT's payload", () => {
    const token = `${base64url({ alg: "HS256" })}.${base64url({ email: "żaneta@example.com" })}.signature`;

    expect(emailInToken(token)).toBe("żaneta@example.com");
  });

  it("gives nothing for anything else", () => {
    for (const token of [
      null,
      "",
      "not-a-jwt",
      "a.%%%.c",
      `a.${base64url({ sub: "1" })}.c`,
      `a.${base64url({ email: 1 })}.c`,
    ]) {
      expect(emailInToken(token), String(token)).toBe("");
    }
  });
});
