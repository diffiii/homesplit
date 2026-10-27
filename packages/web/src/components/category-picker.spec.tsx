import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { expectNoAxeViolations } from "@/test/axe";
import { db } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { CategoryPicker } from "./category-picker";

const flat = () => {
  const found = db.state.households.find(
    (candidate) => candidate.name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no flat");
  }
  return found;
};

const categoryId = (name: string) =>
  db.state.categories.find(
    (category) => category.householdId === flat().id && category.name === name
  )?.id;

const picked: (string | null)[] = [];

function Picker({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="category-label">Category</span>
      <CategoryPicker
        aria-labelledby="category-label"
        onValueChange={(next) => {
          picked.push(next);
          setValue(next);
        }}
        value={value}
      />
    </>
  );
}

function renderPicker(initial: string | null = null) {
  picked.length = 0;
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <Picker initial={initial} />
    </HouseholdShell>,
    { url: `/households/${householdId}/expenses`, params: { householdId } }
  );
}

describe("CategoryPicker", () => {
  it("offers no category first, then each category with its icon", async () => {
    const { user } = renderPicker();

    const trigger = await screen.findByRole("combobox", { name: "Category" });
    await expect.poll(() => trigger).toBeEnabled();
    expect(trigger).toHaveTextContent("No category");
    await user.click(trigger);

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "No category",
      "🍽️Dining out",
      "🎬Entertainment",
      "🛒Groceries",
      "📦Other",
      "🏠Rent",
      "🚗Transport",
      "💡Utilities",
    ]);
    await expectNoAxeViolations(document.body, {
      rules: { "landmark-unique": { enabled: false } },
    });
    await user.click(screen.getByRole("option", { name: "Groceries" }));

    expect(picked).toEqual([categoryId("Groceries")]);
    expect(trigger).toHaveTextContent("🛒Groceries");
  });

  it("picks the empty choice as null", async () => {
    const { user } = renderPicker(categoryId("Rent"));

    const trigger = await screen.findByRole("combobox", { name: "Category" });
    expect(await screen.findByText("Rent")).toBeVisible();
    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: "No category" })
    );

    expect(picked).toEqual([null]);
    expect(trigger).toHaveTextContent("No category");
  });
});
