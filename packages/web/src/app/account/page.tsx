"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { UserMenu } from "@/components/shell/household-shell";
import { buttonVariants } from "@/components/ui/button";
import { useRequiredSession } from "@/hooks/use-required-session";
import { HOME_PATH } from "@/lib/api/session";
import { AppearanceSection } from "./appearance-section";
import { DevicesSection } from "./devices-section";
import { PasswordSection } from "./password-section";
import { ProfileSection } from "./profile-section";

/** The user's own profile, password, devices, and theme, the same in every household. */
export default function AccountPage() {
  const session = useRequiredSession();
  const { data } = session;

  let content = <ListSkeleton label="Loading your account" rows={2} />;
  if (data) {
    const { user } = data;
    content = (
      <>
        <ProfileSection
          onChanged={() => session.refetch()}
          user={{
            email: user.email,
            imageUrl: user.image ?? null,
            name: user.name,
          }}
        />
        <PasswordSection onChanged={() => session.refetch()} />
        <DevicesSection currentSessionId={data.session.id} />
      </>
    );
  } else if (session.error) {
    content = (
      <ErrorState
        error={session.error}
        onRetry={session.refetch}
        retrying={session.isRefetching}
        title="Couldn't load your account"
      />
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between gap-1 px-2">
        {/* The landing page reopens the household last used on this device. */}
        <Link className={buttonVariants({ variant: "ghost" })} href={HOME_PATH}>
          <ArrowLeftIcon aria-hidden data-icon="inline-start" />
          Back
        </Link>
        <UserMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pb-10"
        id="main"
      >
        <PageHeader title="Account" />
        {content}
        <AppearanceSection />
      </main>
    </div>
  );
}
