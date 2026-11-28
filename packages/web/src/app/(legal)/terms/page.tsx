import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TERMS_PATH } from "@/lib/api/session";
import { LegalSection } from "../legal-section";

export const metadata: Metadata = {
  title: "Terms · HomeSplit",
  alternates: { canonical: TERMS_PATH },
};

/** The terms of using HomeSplit. */
export default function TermsPage() {
  return (
    <>
      <PageHeader description="The rules for using HomeSplit." title="Terms" />
      <LegalSection id="use-heading" title="Using HomeSplit">
        <p>
          HomeSplit helps people who share a home keep track of shared expenses,
          chores, and shopping. It&apos;s a free student project made at Wrocław
          University of Science and Technology, offered as it is, without any
          guarantee that it works or stays available. It records what members
          agree they owe each other, but it doesn&apos;t move money, and it
          isn&apos;t financial or legal advice.
        </p>
      </LegalSection>
      <LegalSection id="account-heading" title="Your account">
        <p>
          Keep your password to yourself, and sign out devices you no longer
          use. You&apos;re responsible for what&apos;s done with your account.
          As a household admin or owner, you&apos;re also responsible for who
          you invite and remove.
        </p>
      </LegalSection>
      <LegalSection id="content-heading" title="What you add">
        <p>
          What you add, such as expenses and files, stays yours. You allow
          HomeSplit to store it and show it to the members of your household,
          only to run the service. Don&apos;t upload anything illegal, anything
          you don&apos;t have the right to share, or other people&apos;s
          personal data beyond what the household needs.
        </p>
      </LegalSection>
      <LegalSection id="ai-heading" title="AI features">
        <p>
          AI suggestions, such as an expense&apos;s category or the items read
          from a receipt, can be wrong. A member checks them before they count,
          and what&apos;s saved is that member&apos;s responsibility.
        </p>
      </LegalSection>
      <LegalSection
        id="changes-heading"
        title="Ending your account and changes"
      >
        <p>
          You can ask us to delete your account at any time, as the privacy
          policy describes. We may suspend an account that breaks these terms.
          Because HomeSplit is a student project, we may shut it down at any
          time. We&apos;ll say so on the site beforehand, and then delete all
          data.
        </p>
        <p>
          When these terms change, we&apos;ll update the date on this page. For
          changes that affect what you&apos;ve agreed to, we&apos;ll also email
          you. Polish law applies to these terms.
        </p>
      </LegalSection>
    </>
  );
}
