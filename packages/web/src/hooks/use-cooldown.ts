"use client";

import { useEffect, useState } from "react";

const MS_PER_SECOND = 1000;

/**
 * Seconds left before an action may run again, counting down once a second.
 * `start` begins a new wait; `coolingDown` begins with one, as when an email
 * has just been sent.
 */
export function useCooldown(seconds: number, coolingDown = false) {
  const [until, setUntil] = useState<number | null>(() =>
    coolingDown ? Date.now() + seconds * MS_PER_SECOND : null
  );
  const [now, setNow] = useState(() => Date.now());
  const remaining =
    until === null ? 0 : Math.max(0, Math.ceil((until - now) / MS_PER_SECOND));

  useEffect(() => {
    if (remaining === 0) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [remaining]);

  const start = () => {
    const time = Date.now();
    setNow(time);
    setUntil(time + seconds * MS_PER_SECOND);
  };

  return { remaining, start };
}
