import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { CategorySettings } from "./category-settings";

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

const categoryNames = (householdId: string) =>
  db.state.categories
    .filter((category) => category.householdId === householdId)
    .map((category) => category.name);

function renderCategories(householdId: string) {
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <CategorySettings />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/settings`,
      params: { householdId },
    }
  );
}

const categoryList = () =>
  screen.getByRole("region", { name: "Expense categories" });

describe("CategorySettings", () => {
  it("lets an owner create a category", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderCategories(flat.id);

    await user.click(
      await screen.findByRole("button", { name: "New category" })
    );
    const dialog = await screen.findByRole("dialog", { name: "New category" });
    await user.type(within(dialog).getByLabelText("Name"), "Pets");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await within(categoryList()).findByText("Pets")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(categoryNames(flat.id)).toContain("Pets");
    await expectNoAxeViolations(categoryList());
  });

  it("renames a category and removes its icon", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderCategories(flat.id);

    await user.click(
      await screen.findByRole("button", { name: "Edit Groceries" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit “Groceries”",
    });
    expect(
      within(dialog).getByRole("button", { name: "Icon: 🛒" })
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Remove icon" })
    );
    expect(
      within(dialog).getByRole("button", { name: "Choose an icon" })
    ).toBeVisible();
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Food");
    await expectNoAxeViolations(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(categoryList()).findByText("Food")).toBeVisible();
    expect(
      db.state.categories.find(
        (category) =>
          category.householdId === flat.id && category.name === "Food"
      )
    ).toMatchObject({ icon: null });
  });

  it("explains why a category that expenses use can't be deleted", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderCategories(flat.id);

    await user.click(
      await screen.findByRole("button", { name: "Delete Groceries" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Some expenses use this category"
    );
    expect(categoryNames(flat.id)).toContain("Groceries");
  });

  it("deletes a category that no expense uses", async () => {
    const flat = household("Flat on Piękna");
    const { user } = renderCategories(flat.id);

    await user.click(
      await screen.findByRole("button", { name: "Delete Entertainment" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Utilities")).toBeVisible();
    expect(
      within(categoryList()).queryByText("Entertainment")
    ).not.toBeInTheDocument();
    expect(categoryNames(flat.id)).not.toContain("Entertainment");
  });

  it("shows members the categories without letting them change them", async () => {
    // Alice is a plain member of the cabin.
    renderCategories(household("Lake cabin").id);

    expect(await screen.findByText("Groceries")).toBeVisible();
    expect(
      screen.getByText("Only admins and owners can change them.")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New category" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Groceries" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Groceries" })
    ).not.toBeInTheDocument();
  });

  it("asks admins to turn expenses back on before changing categories", async () => {
    const flat = household("Flat on Piękna");
    flat.features.expenses = false;
    renderCategories(flat.id);

    expect(
      await screen.findByText("Turn expenses back on to change them.")
    ).toBeVisible();
    expect(await screen.findByText("Groceries")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New category" })
    ).not.toBeInTheDocument();
  });
});
