import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCooldown } from "./use-cooldown";

describe("useCooldown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down once a second from the start, then allows again", () => {
    const { result } = renderHook(() => useCooldown(3));
    expect(result.current.remaining).toBe(0);

    act(() => result.current.start());
    expect(result.current.remaining).toBe(3);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(0);
  });

  it("can begin cooling down", () => {
    const { result } = renderHook(() => useCooldown(60, true));

    expect(result.current.remaining).toBe(60);
  });
});
