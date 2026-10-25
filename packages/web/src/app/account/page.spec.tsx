import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, onTestFinished } from "vitest";
import { queryKeys } from "@/lib/api/query-keys";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { MOCK_PASSWORD } from "@/mocks/factories";
import { expectNoAxeViolations } from "@/test/axe";
import { db, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import AccountPage from "./page";

const alice = () => {
  const found = db.userByEmail("alice@example.com");
  if (!found) {
    throw new Error("The scenario has no Alice");
  }
  return found;
};

function renderPage() {
  return renderWithProviders(<AccountPage />, { url: "/account" });
}

const section = (name: string) => screen.getByRole("region", { name });

/** The devices section, once the session has loaded and the page shows it. */
const devicesSection = () =>
  screen.findByRole("region", { name: "Signed-in devices" });

describe("AccountPage", () => {
  it("shows the profile from the session, with initials without an avatar", async () => {
    renderPage();

    expect(await screen.findByLabelText("Name")).toHaveValue("Alice Nowak");
    const profile = section("Profile");
    expect(within(profile).getByText("AN")).toBeVisible();
    expect(within(profile).getByText("alice@example.com")).toBeVisible();
    await expectNoAxeViolations();
  });

  it("saves the name and refreshes the session and every cached query", async () => {
    const { user, queryClient } = renderPage();
    const householdId = db.state.households[0]?.id ?? "";
    const membersKey = queryKeys.householdAuth(householdId, "get");
    queryClient.setQueryData(membersKey, { members: [] });

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "  Alicja Nowak ");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(
      await within(section("Profile")).findByText("Alicja Nowak")
    ).toBeVisible();
    expect(within(section("Profile")).queryByText("Alice Nowak")).toBeNull();
    expect(alice().name).toBe("Alicja Nowak");
    expect(name).toHaveValue("Alicja Nowak");
    expect(queryClient.getQueryState(membersKey)?.isInvalidated).toBe(true);
  });

  it("asks for a name", async () => {
    const { user } = renderPage();

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(name).toHaveAccessibleDescription(
      expect.stringContaining("Enter your name.")
    );
    expect(alice().name).toBe("Alice Nowak");
    await expectNoAxeViolations();
  });

  it("shows what the server says about the name", async () => {
    server.use(
      http.patch("*/api/me", () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            details: {
              issues: [{ path: ["name"], message: "Name is not allowed." }],
            },
          },
          { status: 400 }
        )
      )
    );
    const { user } = renderPage();

    const name = await screen.findByLabelText("Name");
    await user.type(name, "!");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await expect
      .poll(() => name.getAttribute("aria-describedby"))
      .toContain("error");
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining("Name is not allowed.")
    );
  });

  it("changes the password and signs out other devices by default", async () => {
    let sent: unknown;
    const record = async ({ request }: { request: Request }) => {
      if (request.url.endsWith("/api/auth/change-password")) {
        sent = await request.clone().json();
      }
    };
    server.events.on("request:start", record);
    onTestFinished(() => server.events.removeListener("request:start", record));
    const { user } = renderPage();

    await user.type(
      await screen.findByLabelText("Current password"),
      MOCK_PASSWORD
    );
    await user.type(screen.getByLabelText("New password"), "a new password");
    expect(
      screen.getByRole("checkbox", { name: "Sign out of other devices" })
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText(
        "Password changed. Your other devices are signed out."
      )
    ).toBeVisible();
    expect(sent).toEqual({
      currentPassword: MOCK_PASSWORD,
      newPassword: "a new password",
      revokeOtherSessions: true,
    });
    expect(alice().password).toBe("a new password");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("keeps other devices signed in when asked", async () => {
    const { user } = renderPage();

    await user.type(
      await screen.findByLabelText("Current password"),
      MOCK_PASSWORD
    );
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(
      screen.getByRole("checkbox", { name: "Sign out of other devices" })
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Password changed.")).toBeVisible();
  });

  it("explains a wrong current password and a short new one", async () => {
    const { user } = renderPage();

    const current = await screen.findByLabelText("Current password");
    await user.type(current, "not the password");
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await expect
      .poll(() => current.getAttribute("aria-describedby"))
      .toContain("error");
    expect(current).toHaveAccessibleDescription(
      "That's not your current password."
    );
    expect(alice().password).toBe(MOCK_PASSWORD);

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
      expect.stringContaining("Use at least 8 characters.")
    );
    await expectNoAxeViolations();
  });

  it("sets the theme and remembers it on the device", async () => {
    const { user } = renderPage();

    const dark = screen.getByRole("button", { name: "Dark" });
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(dark);

    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "System" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("lists this device first, then the others by last activity", async () => {
    renderPage();

    const devices = await devicesSection();
    const rows = await within(devices).findAllByRole("listitem");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("This device");
    expect(rows[1]).toHaveTextContent("Safari on iOS");
    expect(rows[1]).toHaveTextContent("203.0.113.7");
    expect(rows[2]).toHaveTextContent("Firefox on Windows");
    expect(
      within(rows[0] as HTMLElement).queryByRole("button")
    ).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("signs out one other device", async () => {
    const { user } = renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Sign out Firefox on Windows" })
    );

    const devices = section("Signed-in devices");
    await expect
      .poll(() => within(devices).queryByText("Firefox on Windows"))
      .toBeNull();
    expect(within(devices).getAllByRole("listitem")).toHaveLength(2);
    expect(db.state.otherSessions.map(({ userAgent }) => userAgent)).toEqual([
      expect.stringContaining("iPhone"),
    ]);
  });

  it("signs out every other device after asking", async () => {
    const { user } = renderPage();
    const devices = await devicesSection();

    await user.click(
      await screen.findByRole("button", {
        name: "Sign out of all other devices",
      })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Sign out of 2 other devices?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    // The open dialog hides the rest of the page from queries until it closes.
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    await expect
      .poll(() => within(devices).queryAllByRole("listitem").length)
      .toBe(1);
    expect(
      screen.queryByRole("button", { name: "Sign out of all other devices" })
    ).not.toBeInTheDocument();
    expect(alice().id).toBe(db.state.sessionUserId);
  });

  it("drops the other devices after a password change that signs them out", async () => {
    const { user } = renderPage();
    const devices = await devicesSection();
    await within(devices).findByText("Safari on iOS");

    await user.type(screen.getByLabelText("Current password"), MOCK_PASSWORD);
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await expect
      .poll(() => within(devices).queryAllByRole("listitem").length)
      .toBe(1);
  });

  it("shows an error with a retry when the devices fail to load", async () => {
    server.use(
      http.get("*/api/auth/list-sessions", () =>
        HttpResponse.json(
          { code: "INTERNAL_SERVER_ERROR", message: "Boom" },
          { status: 500 }
        )
      )
    );
    renderPage();

    expect(await screen.findByText("Couldn't load your devices")).toBeVisible();
    expect(
      within(section("Signed-in devices")).getByRole("button", {
        name: "Try again",
      })
    ).toBeVisible();
  });
});
