import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithProviders } from "@/test/render";
import LegalLayout from "./layout";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";

const DRAFT_NOTICE = /This page is a draft/u;

const sections = () =>
  screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);

describe("PrivacyPage", () => {
  it("has a section for each topic the policy must cover", async () => {
    renderWithProviders(
      <LegalLayout params={Promise.resolve({})}>
        <PrivacyPage />
      </LegalLayout>
    );

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

  it("links to the terms and back home", () => {
    renderWithProviders(
      <LegalLayout params={Promise.resolve({})}>
        <PrivacyPage />
      </LegalLayout>
    );

    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(screen.getByRole("link", { name: "HomeSplit" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});

describe("TermsPage", () => {
  it("has its sections and links to the privacy policy", async () => {
    renderWithProviders(
      <LegalLayout params={Promise.resolve({})}>
        <TermsPage />
      </LegalLayout>
    );

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
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(
      within(legal).getByRole("link", { name: "Privacy policy" })
    ).toHaveAttribute("href", "/privacy");
    await expectNoAxeViolations();
  });
});
