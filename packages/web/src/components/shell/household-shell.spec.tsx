import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactElement } from "react";
import { describe, expect, it, onTestFinished } from "vitest";
import ChoresPage from "@/app/households/[householdId]/chores/page";
import OverviewPage from "@/app/households/[householdId]/page";
import SettingsPage from "@/app/households/[householdId]/settings/page";
import { queryKeys } from "@/lib/api/query-keys";
import { readLastHousehold } from "@/lib/last-household";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { useHousehold, useIsDeparted } from "./household-context";
import { HouseholdShell } from "./household-shell";

const household = (name: string) => {
  const found = db.state.households.find(
    (candidate) => candidate.name === name
  );
  if (!found) {
    throw new Error(`The scenario has no household ${name}`);
  }
  return found;
};

const user = (email: string) => {
  const found = db.userByEmail(email);
  if (!found) {
    throw new Error(`The scenario has no user ${email}`);
  }
  return found;
};

function renderShell(householdId: string, page: ReactElement, segment = "") {
  const url = `/households/${householdId}${segment && `/${segment}`}`;
  return renderWithProviders(
    <HouseholdShell householdId={householdId}>{page}</HouseholdShell>,
    { url, params: { householdId } }
  );
}

/** Requests to `/api/...` paths, as `method path`, while the test runs. */
function recordRequests(): string[] {
  const requests: string[] = [];
  const record = ({ request }: { request: Request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  };
  server.events.on("request:start", record);
  onTestFinished(() => {
    server.events.removeListener("request:start", record);
  });
  return requests;
}

// jsdom applies no CSS, so it sees the sidebar and the bottom nav, both
// labelled "Household", where a browser shows one per screen size.
const expectAccessibleShell = () =>
  expectNoAxeViolations(document.body, {
    rules: { "landmark-unique": { enabled: false } },
  });

describe("HouseholdShell", () => {
  it("loads the household once and shares it with the page", async () => {
    const requests = recordRequests();
    const flat = household("Flat on Piękna");
    function Roles() {
      const { role, members } = useHousehold();
      const isDeparted = useIsDeparted();
      const dawid = user("dawid@example.com");
      return (
        <p>
          {role}, {members.length} members, Dawid{" "}
          {isDeparted({ id: dawid.id }) ? "left" : "stayed"}
        </p>
      );
    }
    renderShell(
      flat.id,
      <>
        <Roles />
        <OverviewPage />
      </>
    );

    expect(
      await screen.findByText("owner, 3 members, Dawid left")
    ).toBeVisible();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Alice Nowak"),
        expect.stringContaining("Celina Wiśniewska"),
      ])
    );
    expect(
      requests.filter(
        (request) =>
          request.endsWith("/get-full-organization") ||
          request.endsWith("/features")
      )
    ).toEqual(
      expect.arrayContaining([
        "GET /api/auth/organization/get-full-organization",
        `GET /api/households/${flat.id}/features`,
      ])
    );
    expect(requests).toHaveLength(new Set(requests).size);
    expect(requests.some((request) => request.endsWith("/list-members"))).toBe(
      false
    );
    expect(readLastHousehold()).toBe(flat.id);
    await expectAccessibleShell();
  });

  it("keeps a disabled module reachable, read-only, and marked in the nav", async () => {
    const cabin = household("Lake cabin");
    renderShell(cabin.id, <ChoresPage />, "chores");

    expect(await screen.findByText("Chores are turned off")).toBeVisible();
    expect(
      screen.getByText("An admin can turn them back on", { exact: false })
    ).toBeVisible();
    const [sidebar] = screen.getAllByRole("navigation", { name: "Household" });
    expect(
      within(sidebar).getByRole("link", { name: "Chores" }).closest("li")
    ).toHaveTextContent("Off");
    await expectAccessibleShell();
  });

  it.each([
    ["a household that doesn't exist", () => crypto.randomUUID()],
    ["a household the user isn't in", () => household("Book club").id],
  ])("shows not found for %s", async (_case, householdId) => {
    renderShell(householdId(), <OverviewPage />);

    expect(
      await screen.findByRole("heading", { name: "Household not found" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Your households" })
    ).toHaveAttribute("href", "/households");
    expect(
      screen.queryByRole("navigation", { name: "Household" })
    ).not.toBeInTheDocument();
    expect(readLastHousehold()).toBeNull();
    await expectNoAxeViolations();
  });

  it("shows not found once a household route answers 404 after the user is removed", async () => {
    const flat = household("Flat on Piękna");
    const { queryClient } = renderShell(flat.id, <SettingsPage />, "settings");
    expect(await screen.findByText("Groceries")).toBeVisible();

    const alice = user("alice@example.com");
    db.state.members = db.state.members.filter(
      (member) =>
        !(member.householdId === flat.id && member.userId === alice.id)
    );
    await queryClient.refetchQueries({
      queryKey: queryKeys.endpoint("listExpenseCategories", {
        params: { householdId: flat.id },
      }),
    });

    expect(
      await screen.findByRole("heading", { name: "Household not found" })
    ).toBeVisible();
  });

  it("links to the account settings from the account menu", async () => {
    const { user: actor } = renderShell(
      household("Flat on Piękna").id,
      <OverviewPage />
    );

    await actor.click(
      await screen.findByRole("button", { name: "Alice Nowak" })
    );

    expect(
      await screen.findByRole("menuitem", { name: "Account settings" })
    ).toHaveAttribute("href", "/account");
  });

  it("shows an error with a retry when the household fails to load", async () => {
    server.use(
      http.get("*/api/auth/organization/get-full-organization", () =>
        HttpResponse.json({ message: "Down" }, { status: 503 })
      )
    );
    const { user: actor } = renderShell(
      household("Flat on Piękna").id,
      <OverviewPage />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load this household");
    server.resetHandlers();
    await actor.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Overview" })
    ).toBeVisible();
  });
});
