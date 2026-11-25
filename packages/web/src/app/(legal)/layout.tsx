import { LegalLinks } from "@/components/legal-links";
import { SiteHeader } from "@/components/site-header";
import { DraftNotice } from "./legal-section";

/**
 * The privacy policy and terms: a column of text anyone can open, signed in
 * or not. Prerendered, so it reads nothing about the visitor.
 */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pt-6 pb-16"
        id="main"
      >
        <DraftNotice />
        {children}
      </main>
      <footer className="mx-auto w-full max-w-2xl px-4 pb-8">
        <LegalLinks />
      </footer>
    </div>
  );
}
