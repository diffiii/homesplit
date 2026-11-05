const MAX_TRACKED_KEYS = 10_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Allows `max` attempts per key in any `windowMs`. The counts live in this
 * process: a restart resets them and separate instances don't share them.
 */
export class RateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private lastSweep = 0;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
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
    this.attempts.set(key, recent);
    if (
      this.attempts.size > MAX_TRACKED_KEYS &&
      now - this.lastSweep >= SWEEP_INTERVAL_MS
    ) {
      this.sweep(now);
    }
    return true;
  }

  private recent(key: string, now: number): number[] {
    return (this.attempts.get(key) ?? []).filter(
      (at) => now - at < this.windowMs
    );
  }

  private sweep(now: number): void {
    this.lastSweep = now;
    for (const key of this.attempts.keys()) {
      if (this.recent(key, now).length === 0) {
        this.attempts.delete(key);
      }
    }
  }
}
