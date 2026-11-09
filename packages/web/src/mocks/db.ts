import type {
  AttachmentMimeType,
  ExpenseAllocationInput,
  ExpenseCategory,
  ExpensePayerInput,
  HouseholdFeatures,
  PositiveMoney,
  UserSummary,
} from "@homesplit/contracts";
import type { HouseholdRole } from "@/lib/api/auth-client";

export interface MockUser {
  createdAt: string;
  email: string;
  /** Set once `/verify-email` has verified the user; seeded users start without it. */
  emailVerified?: boolean;
  id: string;
  image: string | null;
  name: string;
  /** Plain text: every seeded user signs in with `MOCK_PASSWORD`. */
  password: string;
}

/** A Better Auth organization with its HomeSplit module flags. */
export interface MockHousehold {
  createdAt: string;
  features: HouseholdFeatures;
  id: string;
  name: string;
  slug: string;
}

/** A current member. Leaving or removal deletes the row, as in Better Auth. */
export interface MockMember {
  createdAt: string;
  householdId: string;
  id: string;
  role: HouseholdRole;
  userId: string;
}

/** `household_membership_history`: kept after leaving, so departed members stay parties. */
export interface MockHistoryEntry {
  firstJoinedAt: string;
  householdId: string;
  userId: string;
}

export interface MockInvitation {
  createdAt: string;
  email: string;
  expiresAt: string;
  householdId: string;
  id: string;
  inviterId: string;
  role: HouseholdRole;
  status: "pending" | "accepted" | "rejected" | "canceled";
}

/** Stored like the backend's rows: users by ID, splits calculated on read. */
export interface MockExpense {
  allocation: ExpenseAllocationInput;
  authorId: string;
  categoryId: string | null;
  createdAt: string;
  description: string | null;
  expenseDate: string;
  householdId: string;
  id: string;
  name: string;
  payers: ExpensePayerInput[];
  total: PositiveMoney;
  updatedAt: string;
}

/** A stored file. Its content isn't kept in the state; see `mocks/api/attachments.ts`. */
export interface MockAttachment {
  createdAt: string;
  householdId: string;
  id: string;
  mimeType: AttachmentMimeType;
  sizeBytes: number;
  uploadedById: string;
}

/** `expense_attachments`: a file linked to an expense. */
export interface MockExpenseAttachment {
  attachmentId: string;
  createdAt: string;
  expenseId: string;
  householdId: string;
}

export interface MockSettlement {
  amount: PositiveMoney;
  confirmedAt: string | null;
  confirmedById: string | null;
  createdAt: string;
  createdById: string;
  householdId: string;
  id: string;
  note: string | null;
  payeeId: string;
  payerId: string;
}

export interface MockChore {
  addedById: string;
  assignedToId: string | null;
  completedAt: string | null;
  completedById: string | null;
  createdAt: string;
  description: string | null;
  dueAt: string | null;
  householdId: string;
  id: string;
  name: string;
  updatedAt: string;
}

export interface MockShoppingItem {
  addedAt: string;
  addedById: string;
  householdId: string;
  id: string;
  name: string;
  purchasedAt: string | null;
  purchasedById: string | null;
  quantity: number;
  unit: string | null;
}

export interface MockFriendship {
  createdAt: string;
  id: string;
  userIds: [string, string];
}

/** A Better Auth session on another device; the current one stands in through `sessionUserId`. */
export interface MockSession {
  createdAt: string;
  id: string;
  ipAddress: string | null;
  token: string;
  updatedAt: string;
  userAgent: string | null;
  userId: string;
}

export interface MockFriendRequest {
  createdAt: string;
  fromId: string;
  id: string;
  toId: string;
}

/** Everything the mocks know, as plain JSON, so the browser can persist it. */
export interface MockState {
  attachments: MockAttachment[];
  categories: ExpenseCategory[];
  chores: MockChore[];
  expenseAttachments: MockExpenseAttachment[];
  expenses: MockExpense[];
  friendRequests: MockFriendRequest[];
  friendships: MockFriendship[];
  history: MockHistoryEntry[];
  households: MockHousehold[];
  invitations: MockInvitation[];
  members: MockMember[];
  /** Sessions on the users' other devices. */
  otherSessions: MockSession[];
  /** The signed-in user, standing in for the session cookie. */
  sessionUserId: string | null;
  settlements: MockSettlement[];
  shoppingItems: MockShoppingItem[];
  users: MockUser[];
}

/**
 * The in-memory backend behind the mock handlers. Handlers read and change
 * `state` directly; the routes call `changed` after every write, so the
 * browser can save it.
 */
export class MockDb {
  state: MockState;
  readonly #listeners = new Set<(state: MockState) => void>();

  constructor(state: MockState) {
    this.state = state;
  }

  /** Swap in another scenario's data. */
  replace(state: MockState): void {
    this.state = state;
    this.changed();
  }

  changed(): void {
    for (const listener of this.#listeners) {
      listener(this.state);
    }
  }

  subscribe(listener: (state: MockState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  user(userId: string): MockUser {
    const user = this.state.users.find(({ id }) => id === userId);
    if (!user) {
      throw new Error(`Mock user ${userId} doesn't exist`);
    }
    return user;
  }

  userByEmail(email: string): MockUser | undefined {
    const normalized = email.toLowerCase();
    return this.state.users.find((user) => user.email === normalized);
  }

  summary(userId: string): UserSummary {
    const { id, name, image } = this.user(userId);
    return { id, name, imageUrl: image };
  }

  household(householdId: string): MockHousehold | undefined {
    return this.state.households.find(({ id }) => id === householdId);
  }

  member(householdId: string, userId: string): MockMember | undefined {
    return this.state.members.find(
      (member) => member.householdId === householdId && member.userId === userId
    );
  }

  members(householdId: string): MockMember[] {
    return this.state.members.filter(
      (member) => member.householdId === householdId
    );
  }

  /** A current or departed member. */
  isParty(householdId: string, userId: string): boolean {
    return this.state.history.some(
      (entry) => entry.householdId === householdId && entry.userId === userId
    );
  }

  /** Add a member and their history row, keeping the first join on rejoining. */
  addMember(member: MockMember): void {
    this.state.members.push(member);
    if (!this.isParty(member.householdId, member.userId)) {
      this.state.history.push({
        householdId: member.householdId,
        userId: member.userId,
        firstJoinedAt: member.createdAt,
      });
    }
  }
}

export function now(): string {
  return new Date().toISOString();
}
