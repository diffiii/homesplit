import type { ReactNode } from "react";

/** Where privacy requests and questions about the legal pages go. */
export const CONTACT_EMAIL = "280633@student.pwr.edu.pl";

/** When the privacy policy and terms last changed, shown on both. */
export const LAST_UPDATED = new Date("2026-11-28");

/** One section of a legal page: an `h2` and its text. */
export function LegalSection({
  id,
  title,
  children,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 leading-relaxed [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5"
    >
      <h2 className="text-lg font-medium" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}
