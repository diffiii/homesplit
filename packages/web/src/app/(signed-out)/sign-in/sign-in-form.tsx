"use client";

import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { useAppForm } from "@/components/form";
import { ApiRequestError } from "@/lib/api/api-error";
import { signIn } from "@/lib/api/auth-client";
import { safeRedirectPath } from "@/lib/api/session";
import { applyServerErrors, showFormError } from "@/lib/form";

const SignInValues = z.object({
  email: z.email("Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});

/** Minimal email sign-in so the shell can be tried; #84 builds the real one. */
export function SignInForm() {
  const redirectTo = safeRedirectPath(useSearchParams().get("redirectTo"));
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: SignInValues },
    onSubmit: async ({ value, formApi }) => {
      const { error } = await signIn.email(value);
      if (error) {
        const failure = ApiRequestError.fromBody("auth", error.status, error);
        if (failure.code === "INVALID_EMAIL_OR_PASSWORD") {
          showFormError(formApi, "Wrong email or password.");
        } else {
          applyServerErrors(formApi, failure);
        }
        return;
      }
      // A full load, so the proxy sees the new session cookie.
      window.location.assign(redirectTo);
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4">
        <form.AppField name="email">
          {(field) => (
            <field.TextField autoComplete="email" label="Email" type="email" />
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
  );
}
