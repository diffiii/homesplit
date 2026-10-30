import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · HomeSplit" };

export default function SignInPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="text-muted-foreground text-sm">
          Welcome back to your household.
        </p>
      </div>
      {/* `useSearchParams` reads `redirectTo` on the client only. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  );
}
