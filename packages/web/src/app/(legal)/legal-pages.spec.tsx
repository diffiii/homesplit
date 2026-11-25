import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithProviders } from "@/test/render";
import LegalLayout from "./layout";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";

const DRAFT_NOTICE = /This page is a draft/u;

const renderLegalPage = (page: ReactNode) =>
  renderWithProviders(
    <LegalLayout params={Promise.resolve({})}>{page}</LegalLayout>
  );

const sections = () =>
  screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);

describe("PrivacyPage", () => {
  it("has a section for each topic the policy must cover", async () => {
    renderLegalPage(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy policy" })
    ).toBeVisible();
    expect(sections()).toEqual([
      "What HomeSplit stores",
      "AI features",
      "Emails",
      "File storage",
      "Deleting your account",
      "Your rights and contact",
    ]);
    expect(screen.getByText(DRAFT_NOTICE)).toBeVisible();
    await expectNoAxeViolations();
  });

  it("links to the other legal page and back home", () => {
    renderLegalPage(<PrivacyPage />);

    expect(screen.getByRole("navigation", { name: "Legal" })).toBeVisible();
    expect(screen.getByRole("link", { name: "HomeSplit" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});

describe("TermsPage", () => {
  it("has its sections and the legal links", async () => {
    renderLegalPage(<TermsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms" })
    ).toBeVisible();
    expect(sections()).toEqual([
      "Using HomeSplit",
      "Your account",
      "What you add",
      "AI features",
      "Ending your account and changes",
    ]);
    expect(screen.getByText(DRAFT_NOTICE)).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeVisible();
    await expectNoAxeViolations();
  });
});
