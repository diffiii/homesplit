"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheckIcon, HourglassIcon, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { ResendVerification } from "@/components/resend-verification";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isApiRequestError } from "@/lib/api/api-error";
import { account } from "@/lib/api/auth-client";
import { safeRedirectPath, signInUrl } from "@/lib/api/session";
import { emailInToken, VERIFICATION_LINK_HOURS } from "@/lib/verification";

/**
 * Verifies the emailed token, which signs the user in on this browser,
 * whichever device signed up (docs/decisions.md, "Email links"). The answer
 * is cached for good, so a second render doesn't verify again and find the
 * link used.
 */
export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token");
  const redirectTo = safeRedirectPath(params.get("redirectTo"));
  const verification = useQuery({
    queryKey: ["verify-email", token],
    queryFn: () => account.verifyEmail({ token: token ?? "" }),
    enabled: Boolean(token),
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const signIn = (
    <Link
      className={buttonVariants({ size: "lg", variant: "outline" })}
      href={signInUrl(redirectTo)}
    >
      Sign in
    </Link>
  );

  if (!token) {
    return (
      <Outcome
        actions={signIn}
        description="It's missing its code. Open the link from the newest email again, or sign in and we'll send a new one."
        icon={<LinkIcon aria-hidden />}
        title="This link is incomplete"
      />
    );
  }

  if (verification.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="text-muted-foreground size-6" />
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Verifying your email…
        </h1>
      </div>
    );
  }

  if (verification.isError) {
    const code = isApiRequestError(verification.error)
      ? verification.error.code
      : undefined;
    if (code === "TOKEN_EXPIRED") {
      const email = emailInToken(token);
      return (
        <Outcome
          actions={
            <>
              {email ? (
                <ResendVerification email={email} redirectTo={redirectTo} />
              ) : null}
              {signIn}
            </>
          }
          description={
            email
              ? `Verification links work for ${VERIFICATION_LINK_HOURS} hours. Send a new one to ${email}, or sign in and we'll send it then.`
              : `Verification links work for ${VERIFICATION_LINK_HOURS} hours. Sign in and we'll send a new one.`
          }
          icon={<HourglassIcon aria-hidden />}
          title="This link has expired"
        />
      );
    }
    if (code === "INVALID_TOKEN") {
      return (
        <Outcome
          actions={signIn}
          description="It may have been cut short when it was copied. Open the link from the newest email again, or sign in and we'll send a new one."
          icon={<LinkIcon aria-hidden />}
          title="This link doesn't work"
        />
      );
    }
    return (
      <ErrorState
        error={verification.error}
        onRetry={verification.refetch}
        retrying={verification.isRefetching}
        title="Couldn't verify your email"
      />
    );
  }

  // A token for an already verified email signs no one in, so nobody, or
  // someone else, is signed in here then.
  const user = verification.data?.user;
  const tokenEmail = emailInToken(token);
  if (
    !user ||
    (tokenEmail && user.email.toLowerCase() !== tokenEmail.toLowerCase())
  ) {
    return (
      <Outcome
        actions={
          <Link
            className={buttonVariants({ size: "lg" })}
            href={signInUrl(redirectTo)}
          >
            Sign in
          </Link>
        }
        description="Your email is already verified, so there's nothing more to do. Sign in to continue."
        icon={<CircleCheckIcon aria-hidden />}
        title="This link was already used"
      />
    );
  }

  return (
    <Outcome
      actions={
        // A full load, so the proxy sees the new session cookie.
        <a className={buttonVariants({ size: "lg" })} href={redirectTo}>
          Continue
        </a>
      }
      description={`Thanks, ${user.email} is verified and you're signed in.`}
      icon={<CircleCheckIcon aria-hidden />}
      title="Email verified"
    />
  );
}

function Outcome({
  icon,
  title,
  description,
  actions,
}: {
  actions: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-4 text-center">
      <span className="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full [&_svg]:size-6">
        {icon}
      </span>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-muted-foreground text-sm">{description}</p>
      <div className="flex flex-col gap-2">{actions}</div>
    </div>
  );
}
