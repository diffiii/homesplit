import { SiteHeader } from "@/components/site-header";

/** Sign-in, sign-up, and the pages emails link to: one centered column. */
export default function SignedOutLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main
        className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 pb-16"
        id="main"
      >
        {children}
      </main>
    </div>
  );
}
