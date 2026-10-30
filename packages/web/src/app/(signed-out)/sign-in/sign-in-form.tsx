"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { useRedirectIfSignedIn } from "@/hooks/use-redirect-if-signed-in";
import { account } from "@/lib/api/auth-client";
import { safeRedirectPath, signUpUrl } from "@/lib/api/session";
import { applyAuthErrors } from "@/lib/auth-errors";

const SignInValues = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export function SignInForm() {
  const redirectTo = safeRedirectPath(useSearchParams().get("redirectTo"));
  useRedirectIfSignedIn(redirectTo);
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: SignInValues },
    onSubmit: async ({ value, formApi }) => {
      try {
        await account.signIn({ ...value, callbackURL: redirectTo });
      } catch (error) {
        applyAuthErrors(formApi, error);
        return;
      }
      // A full load, so the proxy sees the new session cookie.
      window.location.replace(redirectTo);
    },
  });

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
          <form.AppField name="password">
            {(field) => (
              <field.TextField
                autoComplete="current-password"
                label="Password"
                type="password"
              />
            )}
          </form.AppField>
          <form.FormError />
          <form.SubmitButton size="lg">Sign in</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      <p className="text-center text-muted-foreground text-sm">
        New to HomeSplit?{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          href={signUpUrl(redirectTo)}
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
