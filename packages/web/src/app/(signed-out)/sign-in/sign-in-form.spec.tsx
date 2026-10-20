import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { loadScenario } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { SignInForm } from "./sign-in-form";

describe("SignInForm", () => {
  beforeEach(() => loadScenario("signed-out"));

  it("asks for an email and a password", async () => {
    const { user } = renderWithProviders(<SignInForm />, { url: "/sign-in" });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter a valid email address."
    );
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "Enter your password."
    );
    await expectNoAxeViolations();
  });

  it("explains a wrong password", async () => {
    const { user } = renderWithProviders(<SignInForm />, { url: "/sign-in" });

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "not the password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Wrong email or password.")).toBeVisible();
    await expectNoAxeViolations();
  });

  it("keeps redirectTo when switching to sign-up", () => {
    renderWithProviders(<SignInForm />, {
      url: "/sign-in?redirectTo=%2Fhouseholds",
    });

    expect(
      screen.getByRole("link", { name: "Create an account" })
    ).toHaveAttribute("href", "/sign-up?redirectTo=%2Fhouseholds");
  });
});
