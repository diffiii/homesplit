import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LegalLinks } from "./legal-links";

describe("LegalLinks", () => {
  it("links to the privacy policy and the terms", () => {
    renderWithProviders(<LegalLinks />);

    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(
      within(legal).getByRole("link", { name: "Privacy policy" })
    ).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
  });
});
