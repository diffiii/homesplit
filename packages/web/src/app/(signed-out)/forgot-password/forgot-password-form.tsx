"use client";

import { MailIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRedirectIfSignedIn } from "@/hooks/use-redirect-if-signed-in";
import { account } from "@/lib/api/auth-client";
import { HOME_PATH, safeRedirectPath, signInUrl } from "@/lib/api/session";
import { applyAuthErrors, RESET_LINK_HOURS } from "@/lib/auth-errors";
import type { ServerErrors } from "@/lib/form";

const ForgotPasswordValues = z.object({
  email: z.email("Enter a valid email address."),
});

/** Better Auth's and HomeSplit's answers to a reset request, explained. */
const RESET_REQUEST_ERRORS: Partial<Record<string, ServerErrors>> = {
  INVALID_EMAIL: { fields: { email: "Enter a valid email address." } },
  RATE_LIMITED: {
    fields: {},
    form: "Too many reset requests from this network. Wait an hour and try again.",
  },
};

/**
 * Asks for a reset link. The answer is the same whether or not the email has
 * an account, so the page can't tell anyone which emails do.
 */
export function ForgotPasswordForm() {
  const redirectTo = safeRedirectPath(useSearchParams().get("redirectTo"));
  useRedirectIfSignedIn(redirectTo);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: ForgotPasswordValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        await account.requestPasswordReset({
          email: value.email,
          // The emailed link continues there after the reset.
          redirectTo: redirectTo === HOME_PATH ? undefined : redirectTo,
        });
      } catch (error) {
        applyAuthErrors(formApi, error, RESET_REQUEST_ERRORS);
        return;
      }
      setSentTo(value.email);
    },
  });

  const backToSignIn = (
    <p className="text-muted-foreground text-center text-sm">
      Remembered it?{" "}
      <Link
        className="text-foreground font-medium underline underline-offset-4"
        href={signInUrl(redirectTo)}
      >
        Sign in
      </Link>
    </p>
  );

  if (sentTo !== null) {
    return (
      <>
        <Alert role="status">
          <MailIcon aria-hidden />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            If there's a HomeSplit account for {sentTo}, we've sent it a link to
            choose a new password. The link works for {RESET_LINK_HOURS} hour,
            once. Nothing yet? Check your spam folder.
          </AlertDescription>
        </Alert>
        <Button onClick={() => setSentTo(null)} size="lg" variant="outline">
          Send another link
        </Button>
        {backToSignIn}
      </>
    );
  }

  return (
    <>
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                autoComplete="email"
                label="Email"
                type="email"
              />
            )}
          </form.AppField>
          <form.FormError />
          <form.SubmitButton size="lg">Send reset link</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      {backToSignIn}
    </>
  );
}
