import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account · HomeSplit" };

export default function SignUpPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="text-muted-foreground text-sm">
          Share expenses, chores, and shopping with the people you live with.
        </p>
      </div>
      {/* `useSearchParams` reads `redirectTo` on the client only. */}
      <Suspense>
        <SignUpForm />
      </Suspense>
    </>
  );
}
