import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Verify your email · HomeSplit" };

/** Where the verification email links to, with the token and `redirectTo`. */
export default function VerifyEmailPage() {
  return (
    // `useSearchParams` reads the token on the client only.
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
