import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { loadScenario, server } from "@/test/mock-server";
import { renderWithProviders } from "@/test/render";
import { ForgotPasswordForm } from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  beforeEach(() => loadScenario("signed-out"));

  it.each([
    ["an account", "alice@example.com"],
    ["no account", "nobody@example.com"],
  ])(
    "asks for a link and shows the same confirmation for an email with %s",
    async (_, email) => {
      let body: unknown;
      server.use(
        http.post(
          "*/api/auth/request-password-reset",
          async ({ request }) => {
            body = await request.json();
            return HttpResponse.json({ status: true });
          },
          { once: true }
        )
      );
      const { user } = renderWithProviders(<ForgotPasswordForm />, {
        url: "/forgot-password?redirectTo=%2Fhouseholds",
      });

      await user.type(screen.getByLabelText("Email"), email);
      await user.click(screen.getByRole("button", { name: "Send reset link" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        `If there's a HomeSplit account for ${email}, we've sent it a link`
      );
      expect(body).toEqual({ email, redirectTo: "/households" });
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
        "href",
        "/sign-in?redirectTo=%2Fhouseholds"
      );
      await expectNoAxeViolations();
    }
  );

  it("sends no redirectTo when there's nowhere else to go", async () => {
    let body: unknown;
    server.use(
      http.post(
        "*/api/auth/request-password-reset",
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ status: true });
        },
        { once: true }
      )
    );
    const { user } = renderWithProviders(<ForgotPasswordForm />, {
      url: "/forgot-password",
    });

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await screen.findByRole("status");
    expect(body).toEqual({ email: "alice@example.com" });
  });

  it("asks for a valid email", async () => {
    const { user } = renderWithProviders(<ForgotPasswordForm />, {
      url: "/forgot-password",
    });

    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter a valid email address."
    );
  });

  it("explains the rate limit", async () => {
    server.use(
      http.post("*/api/auth/request-password-reset", () =>
        HttpResponse.json(
          { code: "RATE_LIMITED", message: "Too many requests" },
          { status: 429 }
        )
      )
    );
    const { user } = renderWithProviders(<ForgotPasswordForm />, {
      url: "/forgot-password",
    });

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "Too many reset requests from this network. Wait an hour and try again."
      )
    ).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lets the user ask again", async () => {
    const { user } = renderWithProviders(<ForgotPasswordForm />, {
      url: "/forgot-password",
    });

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await user.click(
      await screen.findByRole("button", { name: "Send another link" })
    );

    expect(screen.getByLabelText("Email")).toHaveValue("alice@example.com");
  });
});
