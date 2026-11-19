import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { renderWithProviders } from "@/test/render";
import LandingPage from "./page";

// Currency amounts keep a no-break space after the code.
const PAYMENTS_LABEL =
  /^Suggested payments: Bartek pays Alice PLN\s86\.40, Celina pays Alice PLN\s42\.10\.$/u;

describe("LandingPage", () => {
  it("presents each part of HomeSplit", async () => {
    renderWithProviders(<LandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Keep the house even." })
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual([
      "From the shopping list to settled up",
      "Chores with a name on them",
      "Set up your household",
    ]);
    expect(
      screen.getByRole("img", {
        name: PAYMENTS_LABEL,
      })
    ).toBeVisible();
    await expectNoAxeViolations();
  });

  it("links to the privacy policy and terms from the footer", () => {
    renderWithProviders(<LandingPage />);

    const legal = within(screen.getByRole("contentinfo")).getByRole(
      "navigation",
      { name: "Legal" }
    );
    expect(
      within(legal).getByRole("link", { name: "Privacy policy" })
    ).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
  });

  it("leads to sign-up and sign-in", () => {
    renderWithProviders(<LandingPage />);

    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("link", { name: "Sign in" })
    ).toHaveAttribute("href", "/sign-in");
    expect(
      within(header).getByRole("link", { name: "Create an account" })
    ).toHaveAttribute("href", "/sign-up");
    const hero = screen.getByRole("region", { name: "Keep the house even." });
    expect(
      within(hero).getByRole("link", { name: "Create an account" })
    ).toHaveAttribute("href", "/sign-up");
  });
});
