import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password · HomeSplit" };

/** Where the password reset email links to, with the token and `redirectTo`. */
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      {/* `useSearchParams` reads the token on the client only. */}
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
