import type { AnyFormApi } from "@tanstack/react-form";
import { isApiRequestError } from "./api/api-error";
import { applyServerErrors, type ServerErrors, showServerErrors } from "./form";

/** Better Auth's default password limits, which HomeSplit keeps. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Better Auth codes the sign-in and sign-up forms explain themselves. */
const AUTH_FORM_ERRORS: Partial<Record<string, ServerErrors>> = {
  INVALID_EMAIL_OR_PASSWORD: {
    fields: {},
    form: "Wrong email or password.",
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    fields: {
      email:
        "There's already an account with this email. Sign in instead, or use another email.",
    },
  },
  INVALID_EMAIL: {
    fields: { email: "Enter a valid email address." },
  },
  PASSWORD_TOO_SHORT: {
    fields: { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
  },
  PASSWORD_TOO_LONG: {
    fields: { password: `Use at most ${MAX_PASSWORD_LENGTH} characters.` },
  },
};

/**
 * A failed sign-in or sign-up in plain English, placed on the field it's
 * about, or `undefined` when the generic handling in `applyServerErrors`
 * covers it, as with validation issues and rate limits.
 */
export function authFormErrors(error: unknown): ServerErrors | undefined {
  if (!isApiRequestError(error) || error.source !== "auth") {
    return;
  }
  return AUTH_FORM_ERRORS[error.code];
}

/** Show a failed sign-in or sign-up on the form, like `applyServerErrors`. */
export function applyAuthErrors(
  form: Pick<AnyFormApi, "fieldInfo" | "setErrorMap">,
  error: unknown
): void {
  const known = authFormErrors(error);
  if (known) {
    showServerErrors(form, known);
  } else {
    applyServerErrors(form, error);
  }
}
