import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api-error";
import { notifyError, shouldRetry } from "./query-client";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const errorWith = (status: number, code = "SOME_CODE") =>
  ApiRequestError.fromBody("api", status, { code, message: "Message" });

describe("notifyError", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("toasts rate limits and server errors from either source", () => {
    notifyError(errorWith(429, "RATE_LIMITED"));
    notifyError(errorWith(500, "INTERNAL_ERROR"));
    notifyError(
      ApiRequestError.fromBody("auth", 429, { message: "Too many requests" })
    );
    expect(toast.error).toHaveBeenCalledTimes(3);
  });

  it("leaves every other error to the screen", () => {
    for (const status of [400, 401, 403, 404, 409]) {
      notifyError(errorWith(status));
    }
    notifyError(ApiRequestError.network("api", new TypeError("offline")));
    notifyError(new Error("bug"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("shouldRetry", () => {
  it("retries network and server errors twice", () => {
    const network = ApiRequestError.network("api", undefined);
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, errorWith(503))).toBe(true);
    expect(shouldRetry(2, errorWith(503))).toBe(false);
  });

  it("never retries client errors", () => {
    expect(shouldRetry(0, errorWith(404))).toBe(false);
    expect(shouldRetry(0, errorWith(429))).toBe(false);
    expect(shouldRetry(0, new Error("bug"))).toBe(false);
  });
});
