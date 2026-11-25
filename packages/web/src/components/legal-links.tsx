import Link from "next/link";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/api/session";

const LINK =
  "focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3";

/**
 * The privacy policy and terms, linked from the landing page, sign-up, the
 * account page, and the legal pages themselves.
 */
export function LegalLinks() {
  return (
    <nav
      aria-label="Legal"
      className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm"
    >
      <Link className={LINK} href={PRIVACY_PATH}>
        Privacy policy
      </Link>
      <Link className={LINK} href={TERMS_PATH}>
        Terms
      </Link>
    </nav>
  );
}
