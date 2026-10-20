import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first and last words", () => {
    expect(initials("Anna Maria Nowak")).toBe("AN");
    expect(initials("jan")).toBe("J");
    expect(initials("  Jean-Luc   Picard ")).toBe("JP");
  });

  it("keeps whole characters", () => {
    expect(initials("Łukasz Żak")).toBe("ŁŻ");
    expect(initials("👩‍👩‍👧 Family")).toBe("👩‍👩‍👧F");
  });

  it("has a fallback for blank names", () => {
    expect(initials("   ")).toBe("?");
  });
});
