import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "HomeSplit",
  description: "Share expenses, chores, and shopping with your household.",
  appleWebApp: {
    capable: true,
    title: "HomeSplit",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={cn("font-sans", geist.variable)} lang="en">
      <body>{children}</body>
    </html>
  );
}
