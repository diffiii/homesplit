import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { mockResetToken } from "@/mocks/factories";
import { expectNoAxeViolations } from "@/test/axe";
import { db, loadScenario, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { ResetPasswordForm } from "./reset-password-form";

const NEW_PASSWORD = "a brand new password";
const TOO_SHORT = /Use at least 8 characters\./u;

const alice = () => {
  const user = db.userByEmail("alice@example.com");
  if (!user) {
    throw new Error("The scenario has no Alice");
  }
  return user;
};

function renderReset(search: string) {
  return renderWithProviders(<ResetPasswordForm />, {
    url: `/reset-password${search}`,
  });
}

async function submit(
  user: ReturnType<typeof renderReset>["user"],
  password = NEW_PASSWORD,
  confirmation = password
) {
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ResetPasswordForm", () => {
  beforeEach(() => loadScenario("signed-out"));

  it("sets the new password and sends the user to sign-in", async () => {
    const { user } = renderReset(
      `?token=${mockResetToken(alice().id)}&redirectTo=%2Fhouseholds`
    );
    await expectNoAxeViolations();

    await submit(user);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password changed"
    );
    expect(alice().password).toBe(NEW_PASSWORD);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirectTo=%2Fhouseholds"
    );
    await expectNoAxeViolations();
  });

  it("asks for the same password twice", async () => {
    const before = alice().password;
    const { user } = renderReset(`?token=${mockResetToken(alice().id)}`);

    await submit(user, NEW_PASSWORD, "something else entirely");

    expect(
      screen.getByLabelText("Confirm new password")
    ).toHaveAccessibleDescription("The passwords don't match.");
    expect(alice().password).toBe(before);
  });

  it("asks for a long enough password", async () => {
    const { user } = renderReset(`?token=${mockResetToken(alice().id)}`);

    await submit(user, "short");

    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
      TOO_SHORT
    );
  });

  it("explains an expired or used link and offers a new one", async () => {
    server.use(
      http.post("*/api/auth/reset-password", () =>
        HttpResponse.json(
          { code: "INVALID_TOKEN", message: "Invalid token" },
          { status: 400 }
        )
      )
    );
    const { user } = renderReset("?token=used-token&redirectTo=%2Fhouseholds");

    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired or was already used"
    );
    expect(
      screen.getByRole("link", { name: "Get a new link" })
    ).toHaveAttribute("href", "/forgot-password?redirectTo=%2Fhouseholds");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("explains a link without a token", () => {
    renderReset("");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link is incomplete"
    );
    expect(
      screen.getByRole("link", { name: "Get a new link" })
    ).toHaveAttribute("href", "/forgot-password");
  });
});
