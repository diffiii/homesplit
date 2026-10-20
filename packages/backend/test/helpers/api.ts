import { ApiError } from "@homesplit/contracts";
import type { Response } from "supertest";
import { expect } from "vitest";

/** Asserts the body is an `ApiError` with this `code`. */
export function expectApiError(response: Response, code: string): void {
  expect(ApiError.parse(response.body).code).toBe(code);
}
