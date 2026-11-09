import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { db, loadScenario, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import FriendsPage from "./page";

const renderFriends = () =>
  renderWithProviders(<FriendsPage />, { url: "/friends" });

const section = (name: string) => screen.findByRole("region", { name });

const rowOf = async (sectionName: string, name: string) =>
  within(await section(sectionName))
    .getByText(name)
    .closest("li") as HTMLElement;

const pairs = () =>
  db.state.friendRequests.map(({ fromId, toId }) => [
    db.user(fromId).name,
    db.user(toId).name,
  ]);

const ALREADY_SENT_YOU = /already sent you a request/u;

/** Filip takes back his request to Alice, as if from another device. */
const withdrawFilip = () => {
  db.state.friendRequests = db.state.friendRequests.filter(
    ({ fromId }) => db.user(fromId).name !== "Filip Wójcik"
  );
};

describe("FriendsPage", () => {
  it("lists friends and requests with their names and emails", async () => {
    renderFriends();

    expect(
      screen.getByRole("status", { name: "Loading your friends" })
    ).toBeVisible();
    const filip = await rowOf("Requests for you", "Filip Wójcik");
    expect(filip).toHaveTextContent("filip@example.com");
    const friends = await section("Your friends");
    expect(
      within(friends)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      expect.stringContaining("bartek@example.com"),
      expect.stringContaining("ewa@example.com"),
    ]);
    expect(await rowOf("Sent requests", "Celina Wiśniewska")).toHaveTextContent(
      "celina@example.com"
    );
    await expectNoAxeViolations();
  });

  it("shows an empty friend list and no request sections for a new user", async () => {
    loadScenario("new-user");
    renderFriends();

    expect(await screen.findByText("No friends yet")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Requests for you" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Sent requests" })
    ).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows an error with a retry when a list fails to load", async () => {
    server.use(
      http.get("*/api/me/friend-requests/sent", () =>
        HttpResponse.json(
          { code: "INTERNAL_ERROR", message: "Boom" },
          { status: 500 }
        )
      )
    );
    const { user } = renderFriends();

    expect(await screen.findByText("Couldn't load your friends")).toBeVisible();
    server.resetHandlers();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await section("Sent requests")).toBeVisible();
  });

  it("accepts an incoming request", async () => {
    const { user } = renderFriends();

    await user.click(
      await screen.findByRole("button", {
        name: "Accept request from Filip Wójcik",
      })
    );

    expect(
      await screen.findByText("You and Filip Wójcik are now friends.")
    ).toBeVisible();
    expect(await rowOf("Your friends", "Filip Wójcik")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Requests for you" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("keeps focus on the page when accepting fails because the request was withdrawn", async () => {
    const { user } = renderFriends();
    const button = await screen.findByRole("button", {
      name: "Accept request from Filip Wójcik",
    });
    withdrawFilip();

    await user.click(button);

    expect(
      await screen.findByText(
        "This doesn't exist anymore, or you don't have access to it."
      )
    ).toBeVisible();
    await waitFor(() => expect(button).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it.each([
    {
      button: "Decline request from Filip Wójcik",
      title: "Decline Filip Wójcik's request?",
      confirm: "Decline",
      gone: ["Filip Wójcik", "Alice Nowak"],
    },
    {
      button: "Withdraw request to Celina Wiśniewska",
      title: "Withdraw your request to Celina Wiśniewska?",
      confirm: "Withdraw",
      gone: ["Alice Nowak", "Celina Wiśniewska"],
    },
  ])("asks before $confirm", async ({ button, title, confirm, gone }) => {
    const { user } = renderFriends();

    await user.click(await screen.findByRole("button", { name: button }));
    const dialog = await screen.findByRole("alertdialog", { name: title });
    await expectNoAxeViolations();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(pairs()).toContainEqual(gone);

    await user.click(screen.getByRole("button", { name: button }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: title })).getByRole(
        "button",
        { name: confirm }
      )
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: button })
      ).not.toBeInTheDocument()
    );
    expect(pairs()).not.toContainEqual(gone);
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("keeps focus on the page when the other user acted first", async () => {
    const { user } = renderFriends();
    const button = "Withdraw request to Celina Wiśniewska";

    await user.click(await screen.findByRole("button", { name: button }));
    const dialog = await screen.findByRole("alertdialog");
    db.state.friendRequests = db.state.friendRequests.filter(
      ({ toId }) => db.user(toId).name !== "Celina Wiśniewska"
    );
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This doesn't exist anymore"
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: button })
      ).not.toBeInTheDocument()
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("removes a friend after confirmation", async () => {
    const { user } = renderFriends();

    await user.click(
      await screen.findByRole("button", { name: "Remove Bartek Kowalski" })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Bartek Kowalski?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", { name: "Your friends" })
        ).queryByText("Bartek Kowalski")
      ).not.toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("sends a request and lists it as sent", async () => {
    const { user } = renderFriends();

    await user.type(
      await screen.findByLabelText("Email"),
      " Dawid@Example.com "
    );
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(
      await screen.findByText("Friend request sent to Dawid Lewandowski.")
    ).toBeVisible();
    expect(await rowOf("Sent requests", "Dawid Lewandowski")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it.each([
    ["nobody@example.com", "Nobody has a HomeSplit account with this email."],
    ["alice@example.com", "That's your own email."],
    ["celina@example.com", "You've already sent them a request."],
    ["bartek@example.com", "You're already friends."],
  ])("explains why %s can't be sent a request", async (email, message) => {
    const { user } = renderFriends();

    await user.type(await screen.findByLabelText("Email"), email);
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expectNoAxeViolations();
  });

  it("offers to accept a request the other user sent first", async () => {
    const { user } = renderFriends();

    await user.type(await screen.findByLabelText("Email"), "filip@example.com");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText(ALREADY_SENT_YOU)).toBeVisible();
    await user.click(
      await screen.findByRole("button", { name: "Accept request" })
    );

    expect(await rowOf("Your friends", "Filip Wójcik")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Accept request" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("stops offering a crossed request once it's accepted in its row", async () => {
    const { user } = renderFriends();

    await user.type(await screen.findByLabelText("Email"), "filip@example.com");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    await screen.findByRole("button", { name: "Accept request" });
    await user.click(
      screen.getByRole("button", { name: "Accept request from Filip Wójcik" })
    );

    expect(await rowOf("Your friends", "Filip Wójcik")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Accept request" })
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByText(ALREADY_SENT_YOU)).not.toBeInTheDocument();
  });

  it("stops offering a crossed request that was withdrawn", async () => {
    const { user } = renderFriends();

    await user.type(await screen.findByLabelText("Email"), "filip@example.com");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    const accept = await screen.findByRole("button", {
      name: "Accept request",
    });
    withdrawFilip();
    await user.click(accept);

    await waitFor(() => expect(accept).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    expect(screen.queryByText(ALREADY_SENT_YOU)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("explains the rate limit", async () => {
    server.use(
      http.post("*/api/me/friend-requests", () =>
        HttpResponse.json(
          { code: "RATE_LIMITED", message: "Too many requests" },
          { status: 429 }
        )
      )
    );
    const { user } = renderFriends();

    await user.type(await screen.findByLabelText("Email"), "dawid@example.com");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(
      await screen.findByText(
        "You've sent too many friend requests. Try again in an hour."
      )
    ).toBeVisible();
  });
});
