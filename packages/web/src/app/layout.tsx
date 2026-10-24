import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_SCRIPT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const DESCRIPTION = "Share expenses, chores, and shopping with your household.";

// Pages that set only a title still share the site's name, description, and
// `opengraph-image` in link previews.
export const metadata: Metadata = {
  // Link previews and the canonical URL need absolute URLs. Render, unlike
  // Vercel, gives Next.js no origin to fall back on.
  metadataBase: new URL(
    process.env.SITE_URL || "https://homesplit.janmarek.pl"
  ),
  title: "HomeSplit",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "HomeSplit",
    title: "HomeSplit",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: {
    capable: true,
    title: "HomeSplit",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // Lets `env(safe-area-inset-bottom)` keep the bottom nav clear of the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets `class` and `style` before React hydrates.
    <html
      className={cn("font-sans", geist.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, so the theme applies before the first paint
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
