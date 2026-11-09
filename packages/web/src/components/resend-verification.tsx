"use client";

import { useMutation } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCooldown } from "@/hooks/use-cooldown";
import { account } from "@/lib/api/auth-client";
import { errorMessage } from "@/lib/api/error-message";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/verification";

interface ResendVerificationProps {
  /** Begins with the wait, because an email was just sent. */
  coolingDown?: boolean;
  email: string;
  /** Where the new link continues after verifying. */
  redirectTo: string;
}

/**
 * Sends a new verification link to `email`, then waits before it may again.
 * Better Auth answers the same for an unknown or verified email, and so does
 * this.
 */
export function ResendVerification({
  email,
  redirectTo,
  coolingDown = false,
}: ResendVerificationProps) {
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS, coolingDown);
  const resend = useMutation({
    mutationFn: () =>
      account.sendVerificationEmail({ email, callbackURL: redirectTo }),
    onSettled: cooldown.start,
  });

  let feedback: string | null = null;
  if (resend.isSuccess) {
    feedback = `We sent a new link to ${email}.`;
  } else if (resend.isError) {
    feedback = errorMessage(resend.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={resend.isPending || cooldown.remaining > 0}
        onClick={() => resend.mutate()}
        size="lg"
        variant="outline"
      >
        {resend.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SendIcon aria-hidden data-icon="inline-start" />
        )}
        {cooldown.remaining > 0
          ? `Send a new link in ${cooldown.remaining} s`
          : "Send a new link"}
      </Button>
      {/* Announced when it changes; empty until something was sent. */}
      <p
        aria-live="polite"
        className={
          resend.isError
            ? "text-destructive text-center text-sm"
            : "text-muted-foreground text-center text-sm"
        }
      >
        {feedback}
      </p>
    </div>
  );
}
