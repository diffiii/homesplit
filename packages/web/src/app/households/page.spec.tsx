import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { householdQueries } from "@/lib/api/household-queries";
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
    expect(
      screen.getByText("Joining an existing household?", { exact: false })
    ).toHaveTextContent("sign in with the email address they invited");
    await expectNoAxeViolations();
  });

  it("creates a household and opens it", async () => {
    loadScenario("new-user");
    const { user, queryClient } = renderWithProviders(<HouseholdsPage />, {
      url: "/households",
    });

    await user.click(
      await screen.findByRole("button", { name: "New household" })
    );
    const dialog = await screen.findByRole("dialog", { name: "New household" });
    await expectNoAxeViolations();
    await user.type(within(dialog).getByLabelText("Name"), "  Studio  ");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalled());
    const created = db.state.households.find(({ name }) => name === "Studio");
    expect(router.push).toHaveBeenCalledWith(`/households/${created?.id}`);
    expect(queryClient.getQueryData(householdQueries.list().queryKey)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created?.id, name: "Studio" }),
      ])
    );
  });

  it.each(["", "   "])("rejects a blank name: %j", async (name) => {
    loadScenario("new-user");
    const { user } = renderWithProviders(<HouseholdsPage />, {
      url: "/households",
    });

    await user.click(
      await screen.findByRole("button", { name: "New household" })
    );
    if (name) {
      await user.type(screen.getByLabelText("Name"), name);
    }
    await user.click(await screen.findByRole("button", { name: "Create" }));

    expect(db.state.households).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
    expect(await screen.findByText("Give the household a name.")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
      "Give the household a name."
    );
  });

  it("keeps the name after a failed create and lets the user retry", async () => {
    loadScenario("new-user");
    server.use(
      http.post("*/api/auth/organization/create", () =>
        HttpResponse.json({ message: "Down" }, { status: 503 })
      )
    );
    const { user } = renderWithProviders(<HouseholdsPage />, {
      url: "/households",
    });
    await user.click(
      await screen.findByRole("button", { name: "New household" })
    );
    await user.type(screen.getByLabelText("Name"), "Studio");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again."
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Studio");
    expect(router.push).not.toHaveBeenCalled();
    server.resetHandlers();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(db.state.households).toHaveLength(1);
  });

  it("clears the name and validation errors when reopened after canceling", async () => {
    const { user } = renderWithProviders(<HouseholdsPage />, {
      url: "/households",
    });
    await user.click(
      await screen.findByRole("button", { name: "New household" })
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Give the household a name.")).toBeVisible();
    await user.type(screen.getByLabelText("Name"), "Unfinished");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "New household" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(
      screen.queryByText("Give the household a name.")
    ).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
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
