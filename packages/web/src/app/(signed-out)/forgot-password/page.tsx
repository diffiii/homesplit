import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · HomeSplit" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Forgot your password?
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter your email, and we'll send you a link to choose a new one.
        </p>
      </div>
      {/* `useSearchParams` reads `redirectTo` on the client only. */}
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </>
  );
}
