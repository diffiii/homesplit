import type { ApiError } from "@homesplit/contracts";
import { HttpResponse } from "msw";
import type { z } from "zod";
import type { Issue } from "@/lib/api/api-error";

/**
 * An error answer from a mock handler. Throw it from a resolver and the route
 * answers with its status and body, as the backend's exception filter does.
 */
export class MockApiError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.status = status;
    this.body =
      details === undefined ? { code, message } : { code, message, details };
  }

  toResponse(): Response {
    return HttpResponse.json(this.body, { status: this.status });
  }
}

export const unauthenticated = () =>
  new MockApiError(401, "UNAUTHENTICATED", "Not signed in");

export const notFound = () =>
  new MockApiError(404, "NOT_FOUND", "Resource not found");

export const forbidden = () =>
  new MockApiError(403, "FORBIDDEN", "Not allowed for your role");

export const conflict = (code: string, message: string) =>
  new MockApiError(409, code, message);

export const badRequest = (code: string, message: string) =>
  new MockApiError(400, code, message);

export const validationError = (issues: Issue[], options?: ErrorOptions) =>
  new MockApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed",
    { issues },
    options
  );

export const invalidReference = (issues: Issue[]) =>
  new MockApiError(400, "INVALID_REFERENCE", "Invalid reference", { issues });

/** `{ path, message }` issues, as the backend's validation pipe sends them. */
export function toIssues(error: z.ZodError, prefix: Issue["path"] = []) {
  return error.issues.map(({ path, message }) => ({
    path: [
      ...prefix,
      ...path.map((key) => (typeof key === "number" ? key : String(key))),
    ],
    message,
  }));
}
