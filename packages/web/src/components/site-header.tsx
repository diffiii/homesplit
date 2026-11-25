import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { HOME_PATH } from "@/lib/api/session";

/**
 * The brand header of the pages outside the app shell, such as sign-in and
 * the legal pages: the logo, linking home, and the theme menu.
 */
export function SiteHeader() {
  return (
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
  );
}
