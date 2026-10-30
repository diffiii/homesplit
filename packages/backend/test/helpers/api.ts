import { ApiError } from "@homesplit/contracts";
import type { Response } from "supertest";
import { expect } from "vitest";

/** Asserts the body is an `ApiError` with this `code`. */
export function expectApiError(response: Response, code: string): void {
  expect(ApiError.parse(response.body).code).toBe(code);
}

/** Joins a response's `Set-Cookie` headers into one `Cookie` request header. */
export function sessionCookie(response: Response): string {
  const setCookie = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;
  if (!setCookie?.length) {
    throw new Error("Response set no session cookie");
  }
  return setCookie.map((value) => value.split(";")[0]).join("; ");
}
