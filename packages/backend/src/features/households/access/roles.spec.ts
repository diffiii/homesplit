import { describe, expect, it } from "vitest";
import { hasRole, strongestRole } from "./roles";

describe("strongestRole", () => {
  it.each([
    ["member", "member"],
    ["member,admin", "admin"],
    [" owner , member ", "owner"],
    ["custom,member", "member"],
    ["custom", null],
  ] as const)("reads %j as %s", (stored, expected) => {
    expect(strongestRole(stored)).toBe(expected);
  });
});

describe("hasRole", () => {
  it("ranks member below admin below owner", () => {
    expect(hasRole("member", "admin")).toBe(false);
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("admin", "owner")).toBe(false);
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole(null, "member")).toBe(false);
  });
});
