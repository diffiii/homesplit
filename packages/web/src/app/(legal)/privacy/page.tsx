import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PRIVACY_PATH } from "@/lib/api/session";
import { CONTACT_EMAIL, LegalSection } from "../legal-section";

export const metadata: Metadata = {
  title: "Privacy policy · HomeSplit",
  alternates: { canonical: PRIVACY_PATH },
};

const TEXT_LINK = "font-medium underline underline-offset-4";

const contactLink = (
  <a className={TEXT_LINK} href={`mailto:${CONTACT_EMAIL}`}>
    {CONTACT_EMAIL}
  </a>
);

/**
 * What HomeSplit keeps, why, and who it's shared with, as #134 asks: the data
 * stored, the AI provider and what's sent to it (docs/decisions.md, "AI
 * provider"), the email provider, file storage, and account deletion
 * (docs/decisions.md, "Deleting accounts").
 */
export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        description="What HomeSplit keeps about you, why, and who it's shared with."
        title="Privacy policy"
      />
      <p className="leading-relaxed">
        HomeSplit is a free student project made at Wrocław University of
        Science and Technology in Poland. It isn't a company or a commercial
        service. The students who run it, &ldquo;we&rdquo; below, are the
        controller of your data under the GDPR.
      </p>
      <LegalSection id="data-heading" title="What HomeSplit stores">
        <p>
          <strong>Your account:</strong> your name, email address, password
          (stored only as a hash, never in readable form), profile photo if you
          add one, and the devices you&apos;re signed in on (browser, IP
          address, and last activity), so you can see them and sign them out.
        </p>
        <p>
          <strong>Your households:</strong> which households you&apos;re in and
          your role there, and what members add to them: expenses and how
          they&apos;re split, payments, chores, shopping items, and attached
          files such as receipts. Everyone in a household can see what&apos;s
          added to it. Nobody outside a household can.
        </p>
        <p>
          <strong>In your browser:</strong> one cookie that keeps you signed in,
          and your theme choice. HomeSplit uses no analytics, advertising, or
          tracking cookies.
        </p>
        <p>
          <strong>Server logs:</strong> our hosting provider records requests to
          HomeSplit, such as the time, the address requested, and your IP
          address, so we can find errors. These logs are kept for a few days.
        </p>
        <p>
          We keep this data to run HomeSplit for you: it&apos;s needed to
          provide what you signed up for (GDPR Article 6(1)(b)). We don&apos;t
          sell it, and we don&apos;t use it for anything else.
        </p>
      </LegalSection>
      <LegalSection id="ai-heading" title="AI features">
        <p>
          AI is off in every household until one of its admins turns it on. When
          it&apos;s on, HomeSplit can suggest a category for an expense and read
          the items on a receipt photo.
        </p>
        <p>
          For that, HomeSplit sends Anthropic, the company that makes the Claude
          models, only what the task needs: an expense&apos;s name, description,
          and attached file, or the receipt photo. It never sends names, email
          addresses, or IDs. Anthropic doesn&apos;t use this data to train its
          models and deletes it within 30 days. HomeSplit doesn&apos;t store or
          log what it sends to the model or what comes back.
        </p>
        <p>
          What the AI suggests is only a suggestion: a member checks it before
          anything is saved. Each household can make up to 50 AI requests a day.
        </p>
      </LegalSection>
      <LegalSection id="email-heading" title="Emails">
        <p>
          HomeSplit sends emails through Resend, only when they&apos;re needed:
          to verify your email address, to reset your password, and when someone
          invites you to a household. We don&apos;t send newsletters or
          marketing.
        </p>
      </LegalSection>
      <LegalSection id="files-heading" title="File storage">
        <p>
          Files you attach to expenses and your profile photo are stored with
          Cloudflare R2 in the European Union. Only members of the household can
          open its files, through links that expire after a short time. A file
          that nothing links to any more, for example one uploaded to an expense
          that was never saved, is deleted after 24 hours.
        </p>
      </LegalSection>
      <LegalSection id="deletion-heading" title="Deleting your account">
        <p>
          Deleting your account isn&apos;t in the app yet. Until it is, email us
          at {contactLink} from your account&apos;s address, and we&apos;ll
          delete it. Deleting it:
        </p>
        <ul>
          <li>
            removes your name, email address, password, profile photo, and
            signed-in devices;
          </li>
          <li>
            deletes every household where you&apos;re the last member, with
            everything in it;
          </li>
          <li>passes ownership of your other households to another member;</li>
          <li>
            keeps your expenses and payments in households you share with
            others, under &ldquo;Deleted user&rdquo;, so the other members can
            still settle up.
          </li>
        </ul>
        <p>
          Our database provider keeps a restore history of up to 7 days, so
          deleted data is gone from it within a week. When the project ends,
          we&apos;ll shut HomeSplit down and delete all of its data.
        </p>
      </LegalSection>
      <LegalSection id="rights-heading" title="Your rights and contact">
        <p>
          Under the GDPR you can ask us what we keep about you, get a copy of
          it, have it corrected or deleted, or object to how we use it. For any
          of these, email us at {contactLink}, and we&apos;ll answer within a
          month.
        </p>
        <p>Who processes your data for us:</p>
        <ul>
          <li>Render hosts the app and its logs, in the European Union.</li>
          <li>Neon runs the database, in Frankfurt, Germany.</li>
          <li>
            Cloudflare R2 stores files and profile photos, in the European
            Union.
          </li>
          <li>Resend sends emails, from the United States.</li>
          <li>
            Anthropic runs the AI features, in the United States, only for
            households that turn them on.
          </li>
        </ul>
        <p>
          Only emails and what&apos;s sent to the AI model leave the European
          Union. They&apos;re protected by the safeguards the GDPR requires for
          transfers outside it, such as the EU&apos;s standard contractual
          clauses.
        </p>
        <p>
          If you think we handle your data unlawfully, you can complain to the
          Polish data protection authority, the President of the Personal Data
          Protection Office (Prezes Urzędu Ochrony Danych Osobowych,{" "}
          <a className={TEXT_LINK} href="https://uodo.gov.pl">
            uodo.gov.pl
          </a>
          ).
        </p>
      </LegalSection>
    </>
  );
}
