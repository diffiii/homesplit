import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Says the page is a draft; the legal layout shows it above every page.
 * Remove it once the text is written; writing it is outside #134, which only
 * adds the pages and their sections.
 */
export function DraftNotice() {
  return (
    // A note rather than the default `alert`: it's there from the start, so
    // screen readers shouldn't announce it as news.
    <Alert role="note">
      <InfoIcon aria-hidden />
      <AlertDescription>
        This page is a draft. Its full text will be added soon.
      </AlertDescription>
    </Alert>
  );
}

/**
 * A placeholder for one section of a legal page: its title, and what its
 * text must cover. The PR that writes the text decides how a real section
 * looks.
 */
export function LegalSection({
  id,
  title,
  covers,
}: {
  covers: string;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 className="text-lg font-medium" id={id}>
        {title}
      </h2>
      <p className="text-muted-foreground leading-relaxed">
        To be written: {covers}
      </p>
    </section>
  );
}
