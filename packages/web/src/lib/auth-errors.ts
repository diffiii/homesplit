import type { AnyFormApi } from "@tanstack/react-form";
import { isApiRequestError } from "./api/api-error";
import { applyServerErrors, type ServerErrors, showServerErrors } from "./form";

/** Better Auth's default password limits, which HomeSplit keeps. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** How long a password reset link works, the backend's `resetPasswordTokenExpiresIn`. */
export const RESET_LINK_HOURS = 1;

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
  // Sign-in sends a new link before answering this.
  EMAIL_NOT_VERIFIED: {
    fields: {},
    form: "Verify your email first. We've sent you a new link.",
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

/** Better Auth codes the change-password form explains itself. */
export const CHANGE_PASSWORD_ERRORS: Partial<Record<string, ServerErrors>> = {
  INVALID_PASSWORD: {
    fields: { currentPassword: "That's not your current password." },
  },
  PASSWORD_TOO_SHORT: {
    fields: { newPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
  },
  PASSWORD_TOO_LONG: {
    fields: { newPassword: `Use at most ${MAX_PASSWORD_LENGTH} characters.` },
  },
};

/**
 * A failed sign-in or sign-up in plain English, placed on the field it's
 * about, or `undefined` when the generic handling in `applyServerErrors`
 * covers it, as with validation issues and rate limits. Another form passes
 * the codes it explains, such as `CHANGE_PASSWORD_ERRORS`.
 */
export function authFormErrors(
  error: unknown,
  known = AUTH_FORM_ERRORS
): ServerErrors | undefined {
  if (!isApiRequestError(error) || error.source !== "auth") {
    return;
  }
  return known[error.code];
}

/** Show a failed Better Auth call on the form, like `applyServerErrors`. */
export function applyAuthErrors(
  form: Pick<AnyFormApi, "fieldInfo" | "setErrorMap">,
  error: unknown,
  codes = AUTH_FORM_ERRORS
): void {
  const known = authFormErrors(error, codes);
  if (known) {
    showServerErrors(form, known);
  } else {
    applyServerErrors(form, error);
  }
}
