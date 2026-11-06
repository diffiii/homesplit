import type { SettlementStatus, UserSummary } from "@homesplit/contracts";
import type { HouseholdRole } from "@/lib/api/auth-client";

const ROLE_RANK: Record<HouseholdRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

const isRole = (role: string): role is HouseholdRole =>
  Object.hasOwn(ROLE_RANK, role);

/**
 * Better Auth stores several roles as `admin,member`, and checks use the
 * strongest. `null` when none of them is a HomeSplit role.
 */
export function strongestRole(role: string): HouseholdRole | null {
  const roles = role
    .split(",")
    .map((part) => part.trim())
    .filter(isRole);
  return roles.length > 0
    ? roles.reduce((a, b) => (ROLE_RANK[b] > ROLE_RANK[a] ? b : a))
    : null;
}

/** A current member, as Better Auth lists them. */
export interface MemberRef {
  role: string;
  userId: string;
}

/** The signed-in user and their strongest role in the household. */
export interface Caller {
  role: HouseholdRole;
  userId: string;
}

type UserRef = Pick<UserSummary, "id">;

interface Parties {
  payee: UserRef;
  payer: UserRef;
}

interface PaymentRef extends Parties {
  status: SettlementStatus;
}

/** Whether `user` has left the household: they're no longer among its current members. */
export function isDeparted(
  user: UserRef,
  members: readonly Pick<MemberRef, "userId">[]
): boolean {
  return !members.some(({ userId }) => userId === user.id);
}

/**
 * What the caller may do in the household, from the decision record's
 * matrix (docs/decisions.md, "Roles and permissions"). Rules that depend on
 * balances, such as leaving or deleting the household, are the server's: it
 * answers 409, and the screen explains. Writes to a module that's turned off
 * also depend on its flag, which these rules don't read.
 */
export function permissionsFor(caller: Caller, members: readonly MemberRef[]) {
  const admin = ROLE_RANK[caller.role] >= ROLE_RANK.admin;
  const owner = caller.role === "owner";
  const self = (user: UserRef) => user.id === caller.userId;
  const isParty = ({ payer, payee }: Parties) => self(payer) || self(payee);
  const isOwner = (member: MemberRef) => strongestRole(member.role) === "owner";
  const lastOwner = (member: MemberRef) =>
    isOwner(member) && members.filter(isOwner).length <= 1;

  return {
    renameHousehold: admin,
    /** Only while every balance is zero. */
    deleteHousehold: owner,
    /** Only with every balance settled; the last owner can't leave. */
    leaveHousehold: !lastOwner({ userId: caller.userId, role: caller.role }),
    /** Only an owner invites an owner. */
    invite: (role: HouseholdRole) => admin && (role !== "owner" || owner),
    cancelInvitation: admin,
    /** Only an owner touches an owner's role, and the last owner stays one. */
    changeRole: (target: MemberRef, role: HouseholdRole) =>
      admin &&
      strongestRole(target.role) !== role &&
      (owner || !(isOwner(target) || role === "owner")) &&
      !lastOwner(target),
    /** Nobody removes themselves (they leave), and only an owner removes an owner. */
    removeMember: (target: MemberRef) =>
      admin &&
      target.userId !== caller.userId &&
      (owner || !isOwner(target)) &&
      !lastOwner(target),
    updateFeatures: admin,
    /** Create, rename, and delete expense categories. */
    manageCategories: admin,
    createExpense: true,
    editExpense: (expense: { author: UserRef }) =>
      admin || self(expense.author),
    deleteExpense: (expense: { author: UserRef }) =>
      admin || self(expense.author),
    recordPayment: (payment: Parties) => admin || isParty(payment),
    /** Nobody confirms their own payment. */
    confirmPayment: (payment: PaymentRef) =>
      payment.status === "pending" &&
      !self(payment.payer) &&
      (admin || self(payment.payee)),
    /** Withdraw or reject a payment while it's pending. */
    deletePayment: (payment: PaymentRef) =>
      payment.status === "pending" && (admin || isParty(payment)),
    /** Settle a departed member's balance with payments marked as a write-off. */
    writeOff: admin,
    /** Create, edit, delete, complete, and reopen chores. */
    manageChores: true,
    /** Add, edit, delete, purchase, and clear shopping items. */
    manageShopping: true,
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;
