import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("jan.kowalski@gmail.com")).toBe("j•••@gmail.com");
    expect(maskEmail("a@example.com")).toBe("a•••@example.com");
  });

  it("hides anything that isn't an address", () => {
    expect(maskEmail("no-at-sign")).toBe("•••");
    expect(maskEmail("@example.com")).toBe("•••");
  });
});
