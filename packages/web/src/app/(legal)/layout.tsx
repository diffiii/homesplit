import Link from "next/link";
import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { HOME_PATH } from "@/lib/api/session";

/**
 * The privacy policy and terms: a column of text anyone can open, signed in
 * or not. Prerendered, so it reads nothing about the visitor.
 */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <Link
          className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3"
          href={HOME_PATH}
        >
          <Logo className="size-5" />
          HomeSplit
        </Link>
        <ThemeMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pt-6 pb-16"
        id="main"
      >
        {children}
      </main>
      <footer className="mx-auto w-full max-w-2xl px-4 pb-8">
        <LegalLinks />
      </footer>
    </div>
  );
}
