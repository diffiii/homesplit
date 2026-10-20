import { describe, expect, it } from "vitest";
import { landingPath } from "./last-household";

describe("landingPath", () => {
  it("opens the first-run screen without households", () => {
    expect(landingPath([], "a")).toBe("/households");
  });

  it("opens the household last opened", () => {
    expect(landingPath(["a", "b"], "b")).toBe("/households/b");
  });

  it("falls back to the first household", () => {
    expect(landingPath(["a", "b"], null)).toBe("/households/a");
    expect(landingPath(["a", "b"], "left")).toBe("/households/a");
  });
});
