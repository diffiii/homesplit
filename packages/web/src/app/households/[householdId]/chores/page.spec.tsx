import { act, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HouseholdShell } from "@/components/shell/household-shell";
import { UNDO_DELETE_MS } from "@/lib/use-deferred";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { router } from "@/test/navigation";
import { renderWithProviders } from "@/test/render";
import ChoresPage from "./page";

const flat = () => {
  const found = db.state.households.find(
    (candidate) => candidate.name === "Flat on Piękna"
  );
  if (!found) {
    throw new Error("The scenario has no Flat on Piękna");
  }
  return found;
};

const choreNames = () =>
  db.state.chores
    .filter((chore) => chore.householdId === flat().id)
    .map((chore) => chore.name);

const stored = (name: string) =>
  db.state.chores.find((chore) => chore.name === name);

function renderChores(search = "") {
  const householdId = flat().id;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>
      <ChoresPage />
    </HouseholdShell>,
    {
      url: `/households/${householdId}/chores${search && `?${search}`}`,
      params: { householdId },
    }
  );
}

const names = async (list = "Chores") =>
  within(await screen.findByRole("list", { name: list }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".font-medium")?.textContent);

const row = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`, "u") });

async function fromDetails(
  user: ReturnType<typeof renderChores>["user"],
  chore: string,
  action: string
) {
  await user.click(row(chore));
  const dialog = await screen.findByRole("dialog", { name: chore });
  await user.click(within(dialog).getByRole("button", { name: action }));
}

const DEADLINE = /^Deadline:/u;

// jsdom sees both navs labelled "Household"; a browser shows one per screen size.
const AXE_OPTIONS = { rules: { "landmark-unique": { enabled: false } } };

Element.prototype.setPointerCapture ??= () => undefined;

afterEach(() => {
  vi.useRealTimers();
  toast.dismiss();
});

describe("ChoresPage", () => {
  it("lists open chores by deadline, with the assignee and when it's due", async () => {
    const { container } = renderChores();

    expect(await names()).toEqual([
      "Take out the bins",
      "Clean the bathroom",
      "Fix the wardrobe door",
      "Water the plants",
    ]);
    expect(row("Take out the bins")).toHaveTextContent(
      "Bartek Kowalski · Overdue: Yesterday"
    );
    expect(row("Water the plants")).toHaveTextContent("Unassigned");
    expect(screen.queryByRole("region", { name: "Completed" })).toBeNull();
    await expectNoAxeViolations(container, AXE_OPTIONS);
  });

  it("shows the user's own chores and completed ones from the URL", async () => {
    renderChores("view=mine&completed=true");

    expect(await names()).toEqual(["Clean the bathroom"]);
    expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("button", { name: "Hide completed" })
    ).toBeVisible();
  });

  it("lists completed chores last and keeps the filters in the URL", async () => {
    const { user } = renderChores("completed=true");

    expect(await names("Completed chores")).toEqual(["Defrost the freezer"]);

    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(router.replace).toHaveBeenCalledWith(
      `/households/${flat().id}/chores?view=mine&completed=true`,
      { scroll: false }
    );
    await user.click(screen.getByRole("button", { name: "Hide completed" }));
    expect(router.replace).toHaveBeenCalledWith(
      `/households/${flat().id}/chores`,
      { scroll: false }
    );
  });

  it("opens a chore's details from its row", async () => {
    const { user } = renderChores();
    await names();
    await user.click(row("Clean the bathroom"));

    const dialog = await screen.findByRole("dialog", {
      name: "Clean the bathroom",
    });
    expect(
      within(dialog).getByText("Including the mirror and the shower drain.")
    ).toBeVisible();
    expect(within(dialog).getByText("Alice Nowak")).toBeVisible();
  });

  it("adds a chore from the dialog", async () => {
    const { user } = renderChores();
    await user.click(await screen.findByRole("button", { name: "Add chore" }));
    const dialog = await screen.findByRole("dialog", { name: "New chore" });

    await user.click(within(dialog).getByRole("button", { name: "Add chore" }));
    expect(await within(dialog).findByText("Enter a name.")).toBeVisible();

    await user.type(within(dialog).getByLabelText("Name"), "Mop the hallway");
    await user.type(within(dialog).getByLabelText("Description"), "Both ends");
    await user.click(within(dialog).getByRole("button", { name: "Add chore" }));

    await waitFor(() => expect(choreNames()).toContain("Mop the hallway"));
    expect(
      db.state.chores.find((chore) => chore.name === "Mop the hallway")
    ).toMatchObject({
      description: "Both ends",
      assignedToId: null,
      dueAt: null,
    });
    await waitFor(async () =>
      expect(await names()).toContain("Mop the hallway")
    );
  });

  it("edits a chore and clears its deadline", async () => {
    const { user } = renderChores();
    await user.click(
      await screen.findByRole("button", {
        name: "Actions for Clean the bathroom",
      })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText("Description")).toHaveValue(
      "Including the mirror and the shower drain."
    );
    await user.click(within(dialog).getByRole("button", { name: DEADLINE }));
    await user.click(
      await screen.findByRole("button", { name: "No deadline" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        db.state.chores.find((chore) => chore.name === "Clean the bathroom")
          ?.dueAt
      ).toBeNull()
    );
    await waitFor(async () =>
      expect((await names()).at(-1)).toBe("Clean the bathroom")
    );
  });

  it("deletes a chore a few seconds after it goes from the list", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderChores();
    await user.click(
      await screen.findByRole("button", {
        name: "Actions for Water the plants",
      })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await names()).not.toContain("Water the plants");
    expect(await screen.findByText("Deleted “Water the plants”")).toBeVisible();
    expect(choreNames()).toContain("Water the plants");

    await act(() => vi.advanceTimersByTimeAsync(UNDO_DELETE_MS));

    await waitFor(() => expect(choreNames()).not.toContain("Water the plants"));
  });

  it("completes a chore from its details and reopens it with Undo", async () => {
    const { user } = renderChores();
    await names();
    await fromDetails(user, "Water the plants", "Mark as done");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await names()).not.toContain("Water the plants");
    await waitFor(() =>
      expect(stored("Water the plants")?.completedAt).toEqual(
        expect.any(String)
      )
    );

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await names()).toContain("Water the plants");
    await waitFor(() =>
      expect(stored("Water the plants")?.completedAt).toBeNull()
    );
  });

  it("shows who completed a chore, and reopens it from the completed ones", async () => {
    const { user } = renderChores("completed=true");
    await names();
    await fromDetails(user, "Water the plants", "Mark as done");

    await waitFor(async () =>
      expect(await names("Completed chores")).toContain("Water the plants")
    );
    expect(row("Water the plants")).toHaveTextContent(
      "Alice Nowak did it · just now"
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await fromDetails(user, "Defrost the freezer", "Reopen");

    expect(await names()).toContain("Defrost the freezer");
    await waitFor(() =>
      expect(stored("Defrost the freezer")?.completedAt).toBeNull()
    );
  });

  it("puts a chore back when completing it fails", async () => {
    server.use(
      http.post(
        "*/api/households/:householdId/chores/:choreId/complete",
        () =>
          HttpResponse.json(
            { code: "MODULE_DISABLED", message: "Chores are disabled" },
            { status: 403 }
          ),
        { once: true }
      )
    );
    const { user } = renderChores();
    await names();
    await fromDetails(user, "Water the plants", "Mark as done");

    expect(
      await screen.findByText("Couldn't complete “Water the plants”.")
    ).toBeVisible();
    await waitFor(async () =>
      expect(await names()).toContain("Water the plants")
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
