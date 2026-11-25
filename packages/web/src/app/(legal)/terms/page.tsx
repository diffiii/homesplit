import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TERMS_PATH } from "@/lib/api/session";
import { LegalSection } from "../legal-section";

export const metadata: Metadata = {
  title: "Terms · HomeSplit",
  alternates: { canonical: TERMS_PATH },
};

/** The terms of using HomeSplit. Each section names what its text must cover. */
export default function TermsPage() {
  return (
    <>
      <PageHeader description="The rules for using HomeSplit." title="Terms" />
      <LegalSection
        covers="what HomeSplit is for, who may use it, and that it records what members agree they owe each other but doesn't move money."
        id="use-heading"
        title="Using HomeSplit"
      />
      <LegalSection
        covers="keeping your sign-in details safe, and what you're responsible for in your households."
        id="account-heading"
        title="Your account"
      />
      <LegalSection
        covers="who owns what members add, such as expenses and files, and what may not be uploaded."
        id="content-heading"
        title="What you add"
      />
      <LegalSection
        covers="that AI suggestions, such as categories and scanned receipts, can be wrong and are checked by members before they count."
        id="ai-heading"
        title="AI features"
      />
      <LegalSection
        covers="how you can delete your account, when HomeSplit may suspend one, and how these terms change."
        id="changes-heading"
        title="Ending your account and changes"
      />
    </>
  );
}
