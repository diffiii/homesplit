import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter";

const WINDOW_MS = 1000;

describe("RateLimiter", () => {
  it("allows max attempts per key within the window", () => {
    const limiter = new RateLimiter(2, WINDOW_MS);

    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("a", 1)).toBe(true);
    expect(limiter.tryConsume("a", 2)).toBe(false);
  });

  it("counts keys separately", () => {
    const limiter = new RateLimiter(1, WINDOW_MS);

    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("b", 0)).toBe(true);
    expect(limiter.tryConsume("a", 1)).toBe(false);
  });

  it("allows again once the attempts have left the window", () => {
    const limiter = new RateLimiter(1, WINDOW_MS);

    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("a", WINDOW_MS - 1)).toBe(false);
    expect(limiter.tryConsume("a", WINDOW_MS)).toBe(true);
  });

  it("doesn't count refused attempts", () => {
    const limiter = new RateLimiter(2, WINDOW_MS);

    expect(limiter.tryConsume("a", 0)).toBe(true);
    expect(limiter.tryConsume("a", 500)).toBe(true);
    expect(limiter.tryConsume("a", 600)).toBe(false);
    // The attempt at 0 has expired; the refused one at 600 must not count.
    expect(limiter.tryConsume("a", 1001)).toBe(true);
  });
});
