import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";

/** Sign-in, sign-up, and the pages emails link to: one centered column. */
export default function SignedOutLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <span className="flex items-center gap-2 font-semibold">
          <Logo className="size-5" />
          HomeSplit
        </span>
        <ThemeMenu />
      </header>
      <main
        className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 pb-16"
        id="main"
      >
        {children}
      </main>
    </div>
  );
}
