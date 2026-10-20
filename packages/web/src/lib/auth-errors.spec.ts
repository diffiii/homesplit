import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api/api-error";
import { authFormErrors } from "./auth-errors";

function authError(status: number, code: string) {
  return ApiRequestError.fromBody("auth", status, { code, message: code });
}

describe("authFormErrors", () => {
  it("explains wrong credentials on the form", () => {
    expect(authFormErrors(authError(401, "INVALID_EMAIL_OR_PASSWORD"))).toEqual(
      { fields: {}, form: "Wrong email or password." }
    );
  });

  it("puts a taken email and a weak password on their fields", () => {
    expect(
      authFormErrors(authError(422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"))
        ?.fields
    ).toHaveProperty("email");
    expect(authFormErrors(authError(400, "PASSWORD_TOO_SHORT"))).toEqual({
      fields: { password: "Use at least 8 characters." },
    });
  });

  it("leaves other errors to the generic handling", () => {
    expect(authFormErrors(authError(429, "RATE_LIMITED"))).toBeUndefined();
    expect(authFormErrors(authError(400, "VALIDATION_ERROR"))).toBeUndefined();
    expect(
      authFormErrors(
        ApiRequestError.fromBody("api", 401, {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "",
        })
      )
    ).toBeUndefined();
    expect(authFormErrors(new Error("boom"))).toBeUndefined();
  });
});
