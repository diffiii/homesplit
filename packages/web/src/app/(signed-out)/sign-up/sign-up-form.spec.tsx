import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { loadScenario, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { SignUpForm } from "./sign-up-form";

describe("SignUpForm", () => {
  beforeEach(() => loadScenario("signed-out"));

  it("asks the user to open the emailed link when sign-up gives no session", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/auth/sign-up/email", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: null, user: {} });
      })
    );
    const { user } = renderWithProviders(<SignUpForm />, {
      url: "/sign-up?redirectTo=%2Fhouseholds",
    });

    await user.type(screen.getByLabelText("Name"), " Erin ");
    await user.type(screen.getByLabelText("Email"), "erin@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your inbox"
    );
    expect(screen.getByRole("status")).toHaveTextContent("erin@example.com");
    expect(body).toEqual({
      name: "Erin",
      email: "erin@example.com",
      password: "correct horse",
      callbackURL: "/households",
    });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirectTo=%2Fhouseholds"
    );
    // The email was just sent, so resending waits.
    expect(
      screen.getByRole("button", { name: "Send a new link in 60 s" })
    ).toBeDisabled();
    await expectNoAxeViolations();
  });
});
