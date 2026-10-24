"use client";

import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu } from "@/components/shell/household-shell";
import { ThemeMenu } from "@/components/theme-menu";
import { buttonVariants } from "@/components/ui/button";
import { HOUSEHOLDS_PATH } from "@/lib/last-household";

interface NotFoundPageProps {
  description: ReactNode;
  title: string;
}

/** A page of its own for something that isn't there, with the way back to the households list. */
export function NotFoundPage({ title, description }: NotFoundPageProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-end gap-1 px-2">
        <ThemeMenu />
        <UserMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 pb-24 text-center"
        id="main"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <SearchXIcon aria-hidden className="size-6 text-muted-foreground" />
        </span>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm">{description}</p>
        <Link
          className={buttonVariants({ className: "mt-2" })}
          href={HOUSEHOLDS_PATH}
        >
          Your households
        </Link>
      </main>
    </div>
  );
}
