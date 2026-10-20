import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { db, loadScenario, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import HouseholdsPage from "./page";

describe("HouseholdsPage", () => {
  it("lists the households the user belongs to", async () => {
    renderWithProviders(<HouseholdsPage />, { url: "/households" });

    const list = await screen.findByRole("list");
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["Flat on Piękna", "Lake cabin"]);
    await expectNoAxeViolations();
  });

  it("offers to create the first household", async () => {
    loadScenario("new-user");
    renderWithProviders(<HouseholdsPage />, { url: "/households" });

    expect(await screen.findByText("No households yet")).toBeVisible();
    await expectNoAxeViolations();
  });

  it("creates a household and opens it", async () => {
    loadScenario("new-user");
    const { user } = renderWithProviders(<HouseholdsPage />, {
      url: "/households",
    });

    await user.click(
      await screen.findByRole("button", { name: "New household" })
    );
    const dialog = await screen.findByRole("dialog", { name: "New household" });
    await expectNoAxeViolations();
    await user.type(within(dialog).getByLabelText("Name"), "Studio");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalled());
    const created = db.state.households.find(({ name }) => name === "Studio");
    expect(router.push).toHaveBeenCalledWith(`/households/${created?.id}`);
  });

  it("asks for a name", async () => {
    loadScenario("new-user");
    const { user } = renderWithProviders(<HouseholdsPage />, {
      url: "/households",
    });

    await user.click(
      await screen.findByRole("button", { name: "New household" })
    );
    await user.click(await screen.findByRole("button", { name: "Create" }));

    expect(await screen.findByText("Give the household a name.")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
      "Give the household a name."
    );
  });

  it("shows an error with a retry when the list fails", async () => {
    server.use(
      http.get("*/api/auth/organization/list", () =>
        HttpResponse.json({ message: "Down" }, { status: 503 })
      )
    );
    renderWithProviders(<HouseholdsPage />, { url: "/households" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong. Try again.");
    expect(
      within(alert).getByRole("button", { name: "Try again" })
    ).toBeEnabled();
    await expectNoAxeViolations();
  });
});
