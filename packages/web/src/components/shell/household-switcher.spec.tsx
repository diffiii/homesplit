import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { db, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import { HouseholdSwitcher } from "./household-switcher";

describe("HouseholdSwitcher", () => {
  it("lists memberships and marks the current household", async () => {
    const [flat, cabin] = db.state.households;
    const { user } = renderWithProviders(
      <HouseholdSwitcher householdId={flat.id} />
    );
    (
      await screen.findByRole("button", {
        name: "Switch household, Flat on Piękna",
      })
    ).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: flat.name })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: cabin.name })).toHaveAttribute(
      "href",
      `/households/${cabin.id}`
    );
    expect(
      screen.queryByRole("menuitem", { name: "Book club" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "All households" })
    ).toHaveAttribute("href", "/households");
  });

  it("offers a retry when the list fails", async () => {
    server.use(
      http.get("*/api/auth/organization/list", () =>
        HttpResponse.json({}, { status: 503 })
      )
    );
    const { user } = renderWithProviders(
      <HouseholdSwitcher householdId={db.state.households[0].id} />
    );
    await user.click(
      screen.getByRole("button", { name: "Switch household, Household" })
    );
    expect(await screen.findByText("Couldn't load households")).toBeVisible();
    server.resetHandlers();
    await user.click(screen.getByRole("menuitem", { name: "Try again" }));
    expect(
      await screen.findByRole("button", {
        name: "Switch household, Flat on Piękna",
      })
    ).toBeVisible();
  });

  it("creates a household directly from the switcher and updates the list", async () => {
    const { user } = renderWithProviders(
      <HouseholdSwitcher householdId={db.state.households[0].id} />
    );
    (
      await screen.findByRole("button", {
        name: "Switch household, Flat on Piękna",
      })
    ).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("menuitem", { name: "New household" }));
    await user.type(await screen.findByLabelText("Name"), "Studio");
    await user.click(screen.getByRole("button", { name: "Create" }));
    const created = await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledTimes(1);
      return db.state.households.find(({ name }) => name === "Studio");
    });
    expect(router.push).toHaveBeenCalledWith(`/households/${created?.id}`);
    await user.click(
      screen.getByRole("button", { name: "Switch household, Flat on Piękna" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Studio" })
    ).toHaveAttribute("href", `/households/${created?.id}`);
  });
});
