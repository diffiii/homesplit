"use client";

import { MailIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRedirectIfSignedIn } from "@/hooks/use-redirect-if-signed-in";
import { account } from "@/lib/api/auth-client";
import { safeRedirectPath, signInUrl } from "@/lib/api/session";
import {
  applyAuthErrors,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth-errors";

const SignUpValues = z.object({
  // The limits of `DisplayName`, which the backend checks on sign-up.
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Use at most 100 characters."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`),
});

export function SignUpForm() {
  const redirectTo = safeRedirectPath(useSearchParams().get("redirectTo"));
  useRedirectIfSignedIn(redirectTo);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: SignUpValues },
    onSubmit: async ({ value, formApi }) => {
      let signedIn: boolean;
      try {
        const result = await account.signUp({
          ...value,
          name: value.name.trim(),
          callbackURL: redirectTo,
        });
        signedIn = Boolean(result?.token);
      } catch (error) {
        applyAuthErrors(formApi, error);
        return;
      }
      // No session until the emailed link is opened (docs/decisions.md).
      if (!signedIn) {
        setSentTo(value.email);
        return;
      }
      // A full load lets the proxy see the session cookie.
      window.location.replace(redirectTo);
    },
  });

  if (sentTo !== null) {
    return (
      <>
        <Alert role="status">
          <MailIcon aria-hidden />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            We sent a link to {sentTo}. Open it within 24 hours to finish
            creating your account. No email? Sign in, and we'll send a new one.
          </AlertDescription>
        </Alert>
        <p className="text-center text-muted-foreground text-sm">
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            href={signInUrl(redirectTo)}
          >
            Sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                autoComplete="name"
                description="Shown to the people in your households."
                label="Name"
              />
            )}
          </form.AppField>
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                autoComplete="email"
                label="Email"
                type="email"
              />
            )}
          </form.AppField>
          <form.AppField name="password">
            {(field) => (
              <field.TextField
                autoComplete="new-password"
                description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                label="Password"
                type="password"
              />
            )}
          </form.AppField>
          <form.FormError />
          <form.SubmitButton size="lg">Create account</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          href={signInUrl(redirectTo)}
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
