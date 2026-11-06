export interface RateLimiterOptions {
  /** Attempts one key may make in a window. */
  max: number;
  /** The most keys remembered; the least recently used go first. */
  maxKeys: number;
  windowMs: number;
}

/**
 * Allows `max` attempts per key in any `windowMs`, remembering at most
 * `maxKeys` keys. The counts live in this process: a restart resets them and
 * separate instances don't share them.
 */
export class RateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly max: number;
  private readonly maxKeys: number;
  private readonly windowMs: number;

  constructor({ max, maxKeys, windowMs }: RateLimiterOptions) {
    if (maxKeys < 1) {
      throw new Error("maxKeys must be at least 1");
    }
    this.max = max;
    this.maxKeys = maxKeys;
    this.windowMs = windowMs;
  }

  /** How many keys are remembered. */
  get size(): number {
    return this.attempts.size;
  }

  /**
   * Counts an attempt for `key`. Returns false, and counts nothing, when `key`
   * is already at its limit.
   */
  tryConsume(key: string, now = Date.now()): boolean {
    const recent = this.recent(key, now);
    if (recent.length >= this.max) {
      return false;
    }
    recent.push(now);
    // Re-inserting moves the key to the most recent end of the map.
    this.attempts.delete(key);
    while (this.attempts.size >= this.maxKeys) {
      this.evictLeastRecentlyUsed();
    }
    this.attempts.set(key, recent);

    return true;
  }

  private recent(key: string, now: number): number[] {
    return (this.attempts.get(key) ?? []).filter(
      (at) => now - at < this.windowMs
    );
  }

  private evictLeastRecentlyUsed(): void {
    const oldest = this.attempts.keys().next();
    if (!oldest.done) {
      this.attempts.delete(oldest.value);
    }
  }
}
