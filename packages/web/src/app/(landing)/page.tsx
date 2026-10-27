import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { buttonVariants } from "@/components/ui/button";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/api/session";
import {
  ChoresPreview,
  ExpensePreview,
  PaymentsPreview,
  SettleUpPreview,
  ShoppingPreview,
} from "./previews";

export const metadata: Metadata = {
  title: { absolute: "HomeSplit · Shared expenses, chores, and shopping" },
  alternates: { canonical: "/" },
};

const SECTION = "mx-auto w-full max-w-6xl px-4 sm:px-6";

/**
 * What HomeSplit does, for visitors without a session cookie; the proxy
 * shows everyone else the signed-in home at `/`. Prerendered, so it reads
 * nothing about the visitor.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className={`${SECTION} flex h-16 items-center gap-1`}>
        <span className="mr-auto flex items-center gap-2 font-semibold">
          <Logo className="size-5" />
          HomeSplit
        </span>
        <ThemeMenu />
        <Link
          className={buttonVariants({ variant: "ghost" })}
          href={SIGN_IN_PATH}
        >
          Sign in
        </Link>
        {/* The hero's button is right below on a phone. */}
        <Link
          className={buttonVariants({ className: "max-sm:hidden" })}
          href={SIGN_UP_PATH}
        >
          Create an account
        </Link>
      </header>

      <main className="flex flex-col" id="main">
        <section
          aria-labelledby="hero-heading"
          className={`${SECTION} grid items-center gap-14 pt-10 pb-20 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:pt-24 lg:pb-32`}
        >
          <div className="flex flex-col items-start gap-6">
            <h1
              className="text-balance font-heading font-semibold text-[clamp(3rem,10vw,6.25rem)] leading-[0.92] tracking-[-0.045em]"
              id="hero-heading"
            >
              Keep the house even.
            </h1>
            <p className="max-w-[34rem] text-lg text-muted-foreground leading-relaxed sm:text-xl">
              HomeSplit is one place for what you share at home: what each of
              you paid, who owes whom, whose chore is whose, and what you've run
              out of.
            </p>
            <CallsToAction className="pt-2" />
          </div>
          <SettleUpPreview />
        </section>

        <section
          aria-labelledby="loop-heading"
          className="border-y bg-muted/40 py-20 lg:py-28"
        >
          <div className={`${SECTION} flex flex-col gap-12`}>
            <SectionIntro
              description="One trip to the shop, from the list to everyone paid back."
              id="loop-heading"
              title="From the shopping list to settled up"
            />
            <ol className="grid gap-x-10 lg:grid-cols-3">
              <Step
                description="Anyone adds what's running out. Whoever's at the shop ticks things off as they go."
                preview={<ShoppingPreview />}
                title="Put it on the list"
              />
              <Step
                description="Enter the total in the currency you paid in, and split it equally, by shares, by percentage, or by exact amounts."
                preview={<ExpensePreview />}
                title="Add what you paid"
              />
              <Step
                description="HomeSplit suggests who pays whom. A payment counts once the person receiving it confirms it arrived."
                last
                preview={<PaymentsPreview />}
                title="Settle up"
              />
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="chores-heading"
          className={`${SECTION} grid items-center gap-10 py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:py-28`}
        >
          <SectionIntro
            description="Give each chore to someone and a day it's due. Everyone sees what's done, what's next, and what's overdue, so nobody has to ask twice."
            id="chores-heading"
            title="Chores with a name on them"
          />
          <ChoresPreview />
        </section>

        <section
          aria-labelledby="start-heading"
          className="border-t bg-muted/40 py-20 lg:py-24"
        >
          <div className={`${SECTION} flex flex-col items-start gap-8`}>
            <SectionIntro
              description="Create an account, add your household, and invite the people you live with. It runs in the browser on any phone, and you can add it to your home screen."
              id="start-heading"
              title="Set up your household"
            />
            <CallsToAction />
          </div>
        </section>
      </main>

      <footer className={`${SECTION} py-8`}>
        <span className="flex items-center gap-2 font-medium text-sm">
          <Logo className="size-4" />
          HomeSplit
        </span>
      </footer>
    </div>
  );
}

function CallsToAction({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <Link
        className={buttonVariants({ size: "lg", className: "px-4" })}
        href={SIGN_UP_PATH}
      >
        Create an account
      </Link>
      <Link
        className={buttonVariants({
          size: "lg",
          variant: "outline",
          className: "px-4",
        })}
        href={SIGN_IN_PATH}
      >
        Sign in
      </Link>
    </div>
  );
}

function SectionIntro({
  id,
  title,
  description,
}: {
  description: string;
  id: string;
  title: string;
}) {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h2
        className="text-balance font-heading font-semibold text-3xl tracking-[-0.03em] sm:text-4xl"
        id={id}
      >
        {title}
      </h2>
      <p className="text-lg text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

/**
 * One step of the trip, joined to the next by the logo's line: down the side
 * on a phone, across the top on a wide screen.
 */
function Step({
  title,
  description,
  preview,
  last = false,
}: {
  description: string;
  last?: boolean;
  preview: ReactNode;
  title: string;
}) {
  return (
    <li className="grid grid-cols-[0.75rem_1fr] gap-x-5 lg:grid-cols-1 lg:grid-rows-[0.75rem_auto] lg:gap-y-6">
      <span
        aria-hidden
        className="flex flex-col items-center lg:flex-row lg:items-center"
      >
        <span className="mt-1.5 size-3 shrink-0 rounded-full bg-primary lg:mt-0" />
        <span
          className={`my-1.5 w-0.5 flex-1 bg-primary/40 lg:mx-1.5 lg:my-0 lg:-mr-8.5 lg:h-0.5 lg:w-auto ${last ? "lg:hidden" : ""}`}
        />
      </span>
      <div className={`flex flex-col gap-4 ${last ? "" : "pb-12 lg:pb-0"}`}>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-medium text-lg">{title}</h3>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </div>
        {preview}
      </div>
    </li>
  );
}
