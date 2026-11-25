import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PRIVACY_PATH } from "@/lib/api/session";
import { LegalSection } from "../legal-section";

export const metadata: Metadata = {
  title: "Privacy policy · HomeSplit",
  alternates: { canonical: PRIVACY_PATH },
};

/**
 * What HomeSplit keeps, why, and who it's shared with. Each section names
 * what its text must cover, from #134: the data stored, the AI provider and
 * what's sent to it (docs/decisions.md, "AI provider"), the email provider,
 * file storage, and account deletion (docs/decisions.md, "Deleting
 * accounts").
 */
export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        description="What HomeSplit keeps about you, why, and who it's shared with."
        title="Privacy policy"
      />
      <LegalSection
        covers="your account (name, email, password, photo, and signed-in devices), the households you're in, and what members add to them: expenses, payments, chores, shopping items, and files; who in a household can see what; and why HomeSplit keeps each."
        id="data-heading"
        title="What HomeSplit stores"
      />
      <LegalSection
        covers="which AI provider HomeSplit uses; that AI is off until a household turns it on; what's sent to the model (an expense's name, description, and attached file for category suggestions, and receipt photos when scanning receipts); that names, email addresses, and IDs are never sent; and the daily limit."
        id="ai-heading"
        title="AI features"
      />
      <LegalSection
        covers="which email provider HomeSplit uses, and which emails it sends: verifying an email address, resetting a password, and household invitations."
        id="email-heading"
        title="Emails"
      />
      <LegalSection
        covers="where uploaded files and profile photos are stored, who can open them, and when files nothing links to are deleted."
        id="files-heading"
        title="File storage"
      />
      <LegalSection
        covers="what deleting an account removes and what it keeps: personal data is overwritten, households where you're the last member are deleted, ownership passes to another member, and your entries in shared households stay, under a deleted name, so the other members can still settle up."
        id="deletion-heading"
        title="Deleting your account"
      />
      <LegalSection
        covers="how to ask what HomeSplit keeps about you, have it corrected or deleted, and who to contact."
        id="rights-heading"
        title="Your rights and contact"
      />
    </>
  );
}
