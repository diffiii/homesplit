import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter";

const WINDOW_MS = 1000;
const MANY_KEYS = 100;

const limiter = (max: number, maxKeys = MANY_KEYS) =>
  new RateLimiter({ max, maxKeys, windowMs: WINDOW_MS });

describe("RateLimiter", () => {
  it("allows max attempts per key within the window", () => {
    const rateLimiter = limiter(2);

    expect(rateLimiter.tryConsume("a", 0)).toBe(true);
    expect(rateLimiter.tryConsume("a", 1)).toBe(true);
    expect(rateLimiter.tryConsume("a", 2)).toBe(false);
  });

  it("counts keys separately", () => {
    const rateLimiter = limiter(1);

    expect(rateLimiter.tryConsume("a", 0)).toBe(true);
    expect(rateLimiter.tryConsume("b", 0)).toBe(true);
    expect(rateLimiter.tryConsume("a", 1)).toBe(false);
  });

  it("allows again once the attempts have left the window", () => {
    const rateLimiter = limiter(1);

    expect(rateLimiter.tryConsume("a", 0)).toBe(true);
    expect(rateLimiter.tryConsume("a", WINDOW_MS - 1)).toBe(false);
    expect(rateLimiter.tryConsume("a", WINDOW_MS)).toBe(true);
  });

  it("doesn't count refused attempts", () => {
    const rateLimiter = limiter(2);

    expect(rateLimiter.tryConsume("a", 0)).toBe(true);
    expect(rateLimiter.tryConsume("a", 500)).toBe(true);
    expect(rateLimiter.tryConsume("a", 600)).toBe(false);
    // The attempt at 0 has expired; the refused one at 600 must not count.
    expect(rateLimiter.tryConsume("a", 1001)).toBe(true);
  });

  it("never remembers more keys than maxKeys, even inside the window", () => {
    const rateLimiter = limiter(1, 3);

    for (const key of ["a", "b", "c", "d", "e"]) {
      rateLimiter.tryConsume(key, 0);
    }

    expect(rateLimiter.size).toBe(3);
  });

  it("forgets the least recently used key when full", () => {
    const rateLimiter = limiter(1, 2);
    rateLimiter.tryConsume("a", 0);
    rateLimiter.tryConsume("b", 0);
    rateLimiter.tryConsume("c", 0);

    // "a" was dropped to make room, so it starts again; "c" is still counted.
    expect(rateLimiter.tryConsume("a", 1)).toBe(true);
    expect(rateLimiter.tryConsume("c", 1)).toBe(false);
    expect(rateLimiter.size).toBe(2);
  });

  it("keeps a key that is in use", () => {
    const rateLimiter = limiter(2, 2);
    rateLimiter.tryConsume("a", 0);
    rateLimiter.tryConsume("b", 1);
    rateLimiter.tryConsume("a", 2);
    rateLimiter.tryConsume("c", 3);

    // "b" was the least recently used, so "a" kept its two attempts.
    expect(rateLimiter.tryConsume("a", 4)).toBe(false);
  });

  it("rejects a cap below one key", () => {
    expect(
      () => new RateLimiter({ max: 1, maxKeys: 0, windowMs: WINDOW_MS })
    ).toThrow();
  });
});
