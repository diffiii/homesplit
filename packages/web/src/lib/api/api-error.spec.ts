import { describe, expect, it } from "vitest";
import { ApiRequestError, fieldErrors, issuesOf, NO_STATUS } from "./api-error";

describe("ApiRequestError.fromBody", () => {
  it("keeps an ApiError body", () => {
    const error = ApiRequestError.fromBody("api", 403, {
      code: "MODULE_DISABLED",
      message: "Module disabled",
      details: { module: "chores" },
    });
    expect(error).toMatchObject({
      source: "api",
      status: 403,
      code: "MODULE_DISABLED",
      message: "Module disabled",
      details: { module: "chores" },
    });
  });

  it("reads a Better Auth error the same way", () => {
    const error = ApiRequestError.fromBody(
      "auth",
      401,
      {
        code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
        message: "You are not allowed to delete this member",
        status: 401,
        statusText: "Unauthorized",
      },
      "Unauthorized"
    );
    expect(error).toMatchObject({
      source: "auth",
      status: 401,
      code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
      message: "You are not allowed to delete this member",
      details: undefined,
    });
  });

  it("falls back to the backend's code for the status", () => {
    expect(
      ApiRequestError.fromBody("auth", 429, {
        message: "Too many requests. Please try again later.",
      })
    ).toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    });
    expect(
      ApiRequestError.fromBody("api", 502, undefined, "Bad Gateway")
    ).toMatchObject({ code: "INTERNAL_ERROR", message: "Bad Gateway" });
    expect(ApiRequestError.fromBody("api", 418, "<html>")).toMatchObject({
      code: "UNKNOWN_ERROR",
      message: "Request failed with 418",
    });
  });
});

describe("ApiRequestError.network", () => {
  it("has no status and keeps the cause", () => {
    const cause = new TypeError("Failed to fetch");
    const error = ApiRequestError.network("api", cause);
    expect(error).toMatchObject({
      status: NO_STATUS,
      code: "NETWORK_ERROR",
      cause,
    });
  });
});

describe("fieldErrors", () => {
  const validationError = ApiRequestError.fromBody("api", 400, {
    code: "VALIDATION_ERROR",
    message: "Invalid request",
    details: {
      issues: [
        { path: ["name"], message: "Too short" },
        { path: ["payers", 0, "amount"], message: "Must be positive" },
        { path: ["name"], message: "Second message" },
        { path: [], message: "Invalid body" },
      ],
    },
  });

  it("maps issues onto form fields by path", () => {
    expect(fieldErrors(validationError)).toEqual({
      name: "Too short",
      "payers.0.amount": "Must be positive",
    });
  });

  it("is empty for errors without issues", () => {
    expect(
      fieldErrors(
        ApiRequestError.fromBody("api", 404, {
          code: "NOT_FOUND",
          message: "Not found",
        })
      )
    ).toEqual({});
    expect(issuesOf(new Error("boom"))).toEqual([]);
  });
});
