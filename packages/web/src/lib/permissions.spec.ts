import { describe, expect, it } from "vitest";
import type { HouseholdRole } from "@/lib/api/auth-client";
import {
  isDeparted,
  type MemberRef,
  permissionsFor,
  strongestRole,
} from "./permissions";

const owner: MemberRef = { userId: "owner", role: "owner" };
const admin: MemberRef = { userId: "admin", role: "admin" };
const member: MemberRef = { userId: "member", role: "member" };
const members = [owner, admin, member];

const as = (caller: MemberRef, others: readonly MemberRef[] = members) =>
  permissionsFor(
    { userId: caller.userId, role: strongestRole(caller.role) ?? "member" },
    others
  );

const user = (id: string) => ({ id });

describe("strongestRole", () => {
  it.each([
    ["member", "member"],
    ["admin,member", "admin"],
    ["member, owner", "owner"],
    ["guest", null],
    ["constructor", null],
    ["", null],
  ])("reads %j as %j", (role, expected) => {
    expect(strongestRole(role)).toBe(expected);
  });
});

describe("isDeparted", () => {
  it("marks users who aren't current members", () => {
    expect(isDeparted(user("member"), members)).toBe(false);
    expect(isDeparted(user("left"), members)).toBe(true);
  });
});

describe("permissionsFor", () => {
  it.each([
    [owner, true, true],
    [admin, true, false],
    [member, false, false],
  ])(
    "protects shared configuration from %o",
    (caller, adminPlus, ownerOnly) => {
      const can = as(caller);
      expect(can.renameHousehold).toBe(adminPlus);
      expect(can.cancelInvitation).toBe(adminPlus);
      expect(can.updateFeatures).toBe(adminPlus);
      expect(can.manageCategories).toBe(adminPlus);
      expect(can.writeOff).toBe(adminPlus);
      expect(can.invite("member")).toBe(adminPlus);
      expect(can.invite("owner")).toBe(ownerOnly);
      expect(can.deleteHousehold).toBe(ownerOnly);
    }
  );

  it.each([owner, admin, member])("opens everyday lists to %o", (caller) => {
    const can = as(caller);
    expect(can.createExpense).toBe(true);
    expect(can.manageChores).toBe(true);
    expect(can.manageShopping).toBe(true);
  });

  it("lets the author or an admin+ edit and delete an expense", () => {
    const expense = { author: user("member") };
    for (const caller of [owner, admin, member]) {
      expect(as(caller).editExpense(expense)).toBe(true);
      expect(as(caller).deleteExpense(expense)).toBe(true);
    }
    const others = { author: user("someone") };
    expect(as(member).editExpense(others)).toBe(false);
    expect(as(member).deleteExpense(others)).toBe(false);
    expect(as(admin).editExpense(others)).toBe(true);
  });

  describe("payments", () => {
    const pending = (payer: string, payee: string) => ({
      status: "pending" as const,
      payer: user(payer),
      payee: user(payee),
    });

    it("lets a party or an admin+ record one", () => {
      const between = { payer: user("x"), payee: user("y") };
      expect(as(member).recordPayment(between)).toBe(false);
      expect(as(admin).recordPayment(between)).toBe(true);
      expect(
        as(member).recordPayment({ payer: user("member"), payee: user("y") })
      ).toBe(true);
      expect(
        as(member).recordPayment({ payer: user("x"), payee: user("member") })
      ).toBe(true);
    });

    it("lets the payee or an admin+ confirm, but never the payer", () => {
      expect(as(member).confirmPayment(pending("x", "member"))).toBe(true);
      expect(as(member).confirmPayment(pending("x", "y"))).toBe(false);
      expect(as(admin).confirmPayment(pending("x", "y"))).toBe(true);
      expect(as(admin).confirmPayment(pending("admin", "y"))).toBe(false);
      expect(
        as(admin).confirmPayment({
          ...pending("x", "admin"),
          status: "confirmed",
        })
      ).toBe(false);
    });

    it("lets a party or an admin+ delete one only while it's pending", () => {
      expect(as(member).deletePayment(pending("member", "y"))).toBe(true);
      expect(as(member).deletePayment(pending("x", "member"))).toBe(true);
      expect(as(member).deletePayment(pending("x", "y"))).toBe(false);
      expect(as(admin).deletePayment(pending("x", "y"))).toBe(true);
      expect(
        as(admin).deletePayment({ ...pending("x", "y"), status: "confirmed" })
      ).toBe(false);
    });
  });

  describe("members", () => {
    const secondOwner: MemberRef = { userId: "owner-2", role: "owner" };
    const roles: HouseholdRole[] = ["member", "admin", "owner"];

    it("leaves owners to owners", () => {
      expect(as(admin).changeRole(member, "admin")).toBe(true);
      expect(as(admin).changeRole(admin, "member")).toBe(true);
      expect(as(admin).changeRole(member, "owner")).toBe(false);
      expect(as(admin).removeMember(member)).toBe(true);
      const withTwoOwners = [...members, secondOwner];
      expect(as(admin, withTwoOwners).changeRole(secondOwner, "admin")).toBe(
        false
      );
      expect(as(admin, withTwoOwners).removeMember(secondOwner)).toBe(false);
      expect(as(owner, withTwoOwners).changeRole(secondOwner, "admin")).toBe(
        true
      );
      expect(as(owner, withTwoOwners).removeMember(secondOwner)).toBe(true);
      expect(as(owner).changeRole(member, "owner")).toBe(true);
    });

    it("keeps the last owner an owner", () => {
      expect(as(owner).changeRole(owner, "admin")).toBe(false);
      expect(as(owner).leaveHousehold).toBe(false);
      const withTwoOwners = [...members, secondOwner];
      expect(as(owner, withTwoOwners).changeRole(owner, "admin")).toBe(true);
      expect(as(owner, withTwoOwners).leaveHousehold).toBe(true);
      expect(as(member).leaveHousehold).toBe(true);
    });

    it("never removes the caller, who leaves instead", () => {
      const withTwoOwners = [...members, secondOwner];
      expect(as(owner, withTwoOwners).removeMember(owner)).toBe(false);
      expect(as(admin).removeMember(admin)).toBe(false);
    });

    it("offers no change to the role a member already has", () => {
      for (const role of roles) {
        expect(as(owner).changeRole({ userId: "m", role }, role)).toBe(false);
      }
    });

    it("gives members no say over roles", () => {
      for (const role of roles) {
        expect(as(member).changeRole(admin, role)).toBe(false);
      }
      expect(as(member).removeMember(admin)).toBe(false);
    });
  });
});
