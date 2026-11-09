import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_EXPIRED_VERIFY_TOKEN, mockVerifyToken } from "@/mocks/factories";
import { expectNoAxeViolations } from "@/test/axe";
import { db, loadScenario, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { VerifyEmail } from "./verify-email";

const ALICE = "alice@example.com";

const alice = () => {
  const user = db.userByEmail(ALICE);
  if (!user) {
    throw new Error("The scenario has no Alice");
  }
  return user;
};

/** A JWT-shaped token with `email` in its payload, as Better Auth's are. */
const tokenFor = (email: string) =>
  `header.${btoa(JSON.stringify({ email })).replaceAll("=", "")}.signature`;

function renderVerify(search: string) {
  return renderWithProviders(<VerifyEmail />, {
    url: `/verify-email${search}`,
  });
}

describe("VerifyEmail", () => {
  beforeEach(() => loadScenario("signed-out"));

  it("verifies, signs the user in, and continues to redirectTo", async () => {
    renderVerify(
      `?token=${mockVerifyToken(alice().id)}&redirectTo=%2Fhouseholds`
    );

    expect(
      await screen.findByRole("heading", { name: "Email verified" })
    ).toBeVisible();
    expect(
      screen.getByText(`Thanks, ${ALICE} is verified`, { exact: false })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/households"
    );
    expect(alice().emailVerified).toBe(true);
    expect(db.state.sessionUserId).toBe(alice().id);
    await expectNoAxeViolations();
  });

  it("says when the link was already used", async () => {
    alice().emailVerified = true;
    renderVerify(
      `?token=${mockVerifyToken(alice().id)}&redirectTo=%2Fhouseholds`
    );

    expect(
      await screen.findByRole("heading", { name: "This link was already used" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirectTo=%2Fhouseholds"
    );
    expect(db.state.sessionUserId).toBeNull();
  });

  it("offers a new link when this one expired, then waits before another", async () => {
    let body: unknown;
    server.use(
      http.get("*/api/auth/verify-email", () =>
        HttpResponse.json(
          { code: "TOKEN_EXPIRED", message: "Token expired" },
          { status: 401 }
        )
      ),
      http.post("*/api/auth/send-verification-email", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: true });
      })
    );
    const { user } = renderVerify(
      `?token=${tokenFor(ALICE)}&redirectTo=%2Fhouseholds`
    );

    expect(
      await screen.findByRole("heading", { name: "This link has expired" })
    ).toBeVisible();
    await expectNoAxeViolations();
    await user.click(screen.getByRole("button", { name: "Send a new link" }));

    expect(
      await screen.findByText(`We sent a new link to ${ALICE}.`)
    ).toBeVisible();
    expect(body).toEqual({ email: ALICE, callbackURL: "/households" });
    expect(
      screen.getByRole("button", { name: "Send a new link in 60 s" })
    ).toBeDisabled();
  });

  it("points to sign-in when an expired link doesn't say whose it is", async () => {
    renderVerify(`?token=${MOCK_EXPIRED_VERIFY_TOKEN}`);

    expect(
      await screen.findByRole("heading", { name: "This link has expired" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Send a new link" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in"
    );
  });

  it("explains a tampered link", async () => {
    renderVerify("?token=not-a-real-token");

    expect(
      await screen.findByRole("heading", { name: "This link doesn't work" })
    ).toBeVisible();
  });

  it("explains a link without a token", () => {
    renderVerify("?redirectTo=%2Fhouseholds");

    expect(
      screen.getByRole("heading", { name: "This link is incomplete" })
    ).toBeVisible();
  });
});
