"use client";

import { CircleCheckIcon, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { isApiRequestError } from "@/lib/api/api-error";
import { account } from "@/lib/api/auth-client";
import {
  forgotPasswordUrl,
  safeRedirectPath,
  signInUrl,
} from "@/lib/api/session";
import {
  applyAuthErrors,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  RESET_LINK_HOURS,
} from "@/lib/auth-errors";
import type { ServerErrors } from "@/lib/form";

const ResetPasswordValues = z
  .object({
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Use at most ${MAX_PASSWORD_LENGTH} characters.`
      ),
    confirmPassword: z.string().min(1, "Enter the new password again."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

/** Better Auth codes the reset form explains on its fields. */
const RESET_PASSWORD_ERRORS: Partial<Record<string, ServerErrors>> = {
  PASSWORD_TOO_SHORT: {
    fields: { newPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
  },
  PASSWORD_TOO_LONG: {
    fields: { newPassword: `Use at most ${MAX_PASSWORD_LENGTH} characters.` },
  },
};

type Outcome = "form" | "done" | "invalid";

/**
 * Sets a new password with the emailed token. Resetting signs nobody in and
 * signs the user out everywhere (docs/decisions.md, "Better Auth endpoints"),
 * so the page then sends them to sign-in, on to `redirectTo`.
 */
export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const redirectTo = safeRedirectPath(params.get("redirectTo"));
  const [outcome, setOutcome] = useState<Outcome>("form");
  const form = useAppForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: ResetPasswordValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        await account.resetPassword({
          newPassword: value.newPassword,
          token: token ?? "",
        });
      } catch (error) {
        // Better Auth can't tell a used token from an expired or unknown one.
        if (isApiRequestError(error) && error.code === "INVALID_TOKEN") {
          setOutcome("invalid");
          return;
        }
        applyAuthErrors(formApi, error, RESET_PASSWORD_ERRORS);
        return;
      }
      setOutcome("done");
    },
  });

  if (outcome === "done") {
    return (
      <>
        <Alert role="status">
          <CircleCheckIcon aria-hidden />
          <AlertTitle>Password changed</AlertTitle>
          <AlertDescription>
            Every device that was signed in has been signed out. Sign in with
            your new password.
          </AlertDescription>
        </Alert>
        <Link
          className={buttonVariants({ size: "lg" })}
          href={signInUrl(redirectTo)}
        >
          Sign in
        </Link>
      </>
    );
  }

  if (!token || outcome === "invalid") {
    return (
      <>
        {/* Not `destructive`: its red text fails contrast on the card in light mode. */}
        <Alert role="alert">
          <LinkIcon aria-hidden />
          <AlertTitle>
            {token
              ? "This link has expired or was already used"
              : "This link is incomplete"}
          </AlertTitle>
          <AlertDescription>
            {token
              ? `A reset link works for ${RESET_LINK_HOURS} hour, once. Ask for a new one and open the newest email.`
              : "Open the link from the email again, or ask for a new one."}
          </AlertDescription>
        </Alert>
        <Link
          className={buttonVariants({ size: "lg" })}
          href={forgotPasswordUrl(redirectTo)}
        >
          Get a new link
        </Link>
      </>
    );
  }

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4">
        <form.AppField name="newPassword">
          {(field) => (
            <field.TextField
              autoComplete="new-password"
              description={`At least ${MIN_PASSWORD_LENGTH} characters. You'll be signed out on every device.`}
              label="New password"
              type="password"
            />
          )}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => (
            <field.TextField
              autoComplete="new-password"
              label="Confirm new password"
              type="password"
            />
          )}
        </form.AppField>
        <form.FormError />
        <form.SubmitButton size="lg">Change password</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
