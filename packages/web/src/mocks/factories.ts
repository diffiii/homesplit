import {
  type AttachmentMimeType,
  type CurrencyCode,
  type ExpenseAllocationInput,
  type ExpenseCategory,
  type HouseholdFeatures,
  isImageType,
} from "@homesplit/contracts";
import type { HouseholdRole } from "@/lib/api/auth-client";
import { toIsoDate } from "@/lib/dates";
import type {
  MockAttachment,
  MockChore,
  MockExpense,
  MockHousehold,
  MockInvitation,
  MockMember,
  MockReceipt,
  MockReceiptItem,
  MockSettlement,
  MockShoppingItem,
  MockState,
  MockUser,
} from "./db";

/** Every seeded user's password. */
export const MOCK_PASSWORD = "homesplit";

/**
 * The token in the mocks' password reset link for `userId`. The mocks send no
 * email, so open `/reset-password?token=…` with it by hand.
 */
export const mockResetToken = (userId: string) => `mock-reset-${userId}`;

/**
 * The token in the mocks' verification link for `userId`; open
 * `/verify-email?token=…` with it by hand. `MOCK_EXPIRED_VERIFY_TOKEN` answers
 * like an expired link.
 */
export const mockVerifyToken = (userId: string) => `mock-verify-${userId}`;
export const MOCK_EXPIRED_VERIFY_TOKEN = "mock-verify-expired";

/** The categories the backend gives every new household. */
const DEFAULT_CATEGORIES = [
  ["Groceries", "🛒"],
  ["Utilities", "💡"],
  ["Rent", "🏠"],
  ["Transport", "🚗"],
  ["Dining out", "🍽️"],
  ["Entertainment", "🎬"],
  ["Other", "📦"],
] as const;

export function defaultCategories(
  householdId: string,
  id: () => string = () => crypto.randomUUID()
): ExpenseCategory[] {
  return DEFAULT_CATEGORIES.map(([name, icon]) => ({
    id: id(),
    householdId,
    name,
    icon,
  }));
}

export function emptyState(): MockState {
  return {
    sessionUserId: null,
    otherSessions: [],
    users: [],
    households: [],
    members: [],
    history: [],
    invitations: [],
    categories: [],
    expenses: [],
    attachments: [],
    expenseAttachments: [],
    receipts: [],
    settlements: [],
    chores: [],
    shoppingItems: [],
    friendships: [],
    friendRequests: [],
  };
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** When something happened, in days (and hours) before the factory's `now`. */
export interface Ago {
  daysAgo?: number;
  hoursAgo?: number;
}

type Payers = [user: MockUser, amountCents: number][];

export interface ExpenseInput extends Ago {
  allocation?: ExpenseAllocationInput;
  amountCents: number;
  author: MockUser;
  category?: string;
  currency?: CurrencyCode;
  description?: string;
  name: string;
  /** Equal split among these users, unless `allocation` is given. */
  participants?: MockUser[];
  /** The author pays everything, unless given. */
  payers?: Payers;
}

/**
 * Builds mock data with sequential IDs, so the same scenario always has the
 * same IDs, and times relative to `now`, so it always looks recent.
 */
export class MockFactory {
  readonly state = emptyState();
  readonly #now: number;
  #lastId = 0;

  constructor(now = Date.now()) {
    this.#now = now;
  }

  id(): string {
    this.#lastId += 1;
    return `00000000-0000-4000-8000-${this.#lastId.toString(16).padStart(12, "0")}`;
  }

  time({ daysAgo = 0, hoursAgo = 0 }: Ago = {}): string {
    return new Date(
      this.#now - daysAgo * DAY_MS - hoursAgo * HOUR_MS
    ).toISOString();
  }

  /** A calendar date in the device's time zone, as the app compares with today. */
  date(ago: Ago = {}): string {
    return toIsoDate(new Date(this.time(ago)));
  }

  user(name: string, email: string, image: string | null = null): MockUser {
    const user = {
      id: this.id(),
      name,
      email,
      image,
      password: MOCK_PASSWORD,
      createdAt: this.time({ daysAgo: 400 }),
    };
    this.state.users.push(user);
    return user;
  }

  household(
    name: string,
    features: Partial<HouseholdFeatures> = {},
    ago: Ago = { daysAgo: 365 }
  ): MockHousehold {
    const household = {
      id: this.id(),
      name,
      slug: this.id(),
      createdAt: this.time(ago),
      features: {
        expenses: true,
        chores: true,
        shopping: true,
        ai: false,
        ...features,
      },
    };
    this.state.households.push(household);
    this.state.categories.push(
      ...defaultCategories(household.id, () => this.id())
    );
    return household;
  }

  join(
    household: MockHousehold,
    user: MockUser,
    role: HouseholdRole,
    ago: Ago = { daysAgo: 300 }
  ): MockMember {
    const member = {
      id: this.id(),
      householdId: household.id,
      userId: user.id,
      role,
      createdAt: this.time(ago),
    };
    this.state.members.push(member);
    this.state.history.push({
      householdId: household.id,
      userId: user.id,
      firstJoinedAt: member.createdAt,
    });
    return member;
  }

  /** Leave: the member row goes, and the history row stays. */
  leave(household: MockHousehold, user: MockUser): void {
    this.state.members = this.state.members.filter(
      (member) =>
        !(member.householdId === household.id && member.userId === user.id)
    );
  }

  category(household: MockHousehold, name: string): ExpenseCategory {
    const category = this.state.categories.find(
      (row) => row.householdId === household.id && row.name === name
    );
    if (!category) {
      throw new Error(`No category ${name} in ${household.name}`);
    }
    return category;
  }

  expense(household: MockHousehold, input: ExpenseInput): MockExpense {
    const { author, amountCents, currency = "PLN" } = input;
    const createdAt = this.time(input);
    const expense = {
      id: this.id(),
      householdId: household.id,
      name: input.name,
      description: input.description ?? null,
      total: { amountCents, currency },
      payers: (input.payers ?? [[author, amountCents]]).map(
        ([user, amount]) => ({ userId: user.id, amountCents: amount })
      ),
      authorId: author.id,
      categoryId: input.category
        ? this.category(household, input.category).id
        : null,
      expenseDate: this.date(input),
      allocation: input.allocation ?? {
        method: "equal",
        participants: (input.participants ?? [author]).map(({ id }) => ({
          userId: id,
        })),
      },
      createdAt,
      updatedAt: createdAt,
    } satisfies MockExpense;
    this.state.expenses.push(expense);
    return expense;
  }

  /** A file uploaded by `uploadedBy` and linked to `expense`. Images have a thumbnail. */
  attachment(
    expense: MockExpense,
    input: Ago & {
      mimeType: AttachmentMimeType;
      sizeBytes: number;
      uploadedBy: MockUser;
    }
  ): MockAttachment {
    const createdAt = this.time(input);
    const attachment = {
      id: this.id(),
      householdId: expense.householdId,
      hasThumbnail: isImageType(input.mimeType),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedById: input.uploadedBy.id,
      createdAt,
    };
    this.state.attachments.push(attachment);
    this.state.expenseAttachments.push({
      householdId: expense.householdId,
      expenseId: expense.id,
      attachmentId: attachment.id,
      createdAt,
    });
    return attachment;
  }

  /**
   * A receipt scanned by `scannedBy` from a photo, `ready` with `items`
   * unless `failureCode` makes it `failed` with nothing read.
   */
  receipt(
    household: MockHousehold,
    input: Ago & {
      currency?: CurrencyCode;
      discountCents?: number;
      failureCode?: MockReceipt["failureCode"];
      items?: Omit<MockReceiptItem, "assignments" | "id" | "position">[];
      merchant?: string;
      scannedBy: MockUser;
      suggestedCategory?: MockReceipt["suggestedCategory"];
      totalCents?: number;
    }
  ): MockReceipt {
    const createdAt = this.time(input);
    const attachment = {
      id: this.id(),
      householdId: household.id,
      hasThumbnail: true,
      mimeType: "image/jpeg" as const,
      sizeBytes: 1_258_291,
      uploadedById: input.scannedBy.id,
      createdAt,
    };
    this.state.attachments.push(attachment);
    const failed = input.failureCode !== undefined;
    const receipt: MockReceipt = {
      id: this.id(),
      householdId: household.id,
      attachmentId: attachment.id,
      status: failed ? "failed" : "ready",
      failureCode: input.failureCode ?? null,
      merchant: failed ? null : (input.merchant ?? null),
      purchasedOn: failed ? null : this.date(input),
      currency: failed ? null : (input.currency ?? "PLN"),
      totalCents: failed ? null : (input.totalCents ?? null),
      discountCents: input.discountCents ?? 0,
      items: (input.items ?? []).map((item, position) => ({
        ...item,
        id: this.id(),
        position,
        assignments: [],
      })),
      suggestedCategory: failed ? null : (input.suggestedCategory ?? null),
      expenseId: null,
      createdById: input.scannedBy.id,
      createdAt,
      updatedAt: createdAt,
    };
    this.state.receipts.push(receipt);
    return receipt;
  }

  settlement(
    household: MockHousehold,
    input: Ago & {
      amountCents: number;
      confirmed: boolean;
      createdBy?: MockUser;
      currency?: CurrencyCode;
      note?: string;
      payee: MockUser;
      payer: MockUser;
    }
  ): MockSettlement {
    const createdBy = input.createdBy ?? input.payer;
    const createdAt = this.time(input);
    const settlement = {
      id: this.id(),
      householdId: household.id,
      payerId: input.payer.id,
      payeeId: input.payee.id,
      createdById: createdBy.id,
      amount: {
        amountCents: input.amountCents,
        currency: input.currency ?? "PLN",
      },
      note: input.note ?? null,
      createdAt,
      confirmedById: input.confirmed
        ? (createdBy === input.payer ? input.payee : createdBy).id
        : null,
      confirmedAt: input.confirmed ? createdAt : null,
    };
    this.state.settlements.push(settlement);
    return settlement;
  }

  chore(
    household: MockHousehold,
    input: Ago & {
      addedBy: MockUser;
      assignedTo?: MockUser;
      completedBy?: MockUser;
      description?: string;
      /** Days from now; negative is overdue. */
      dueInDays?: number;
      name: string;
    }
  ): MockChore {
    const createdAt = this.time(input);
    const completedAt = input.completedBy ? this.time() : null;
    const chore = {
      id: this.id(),
      householdId: household.id,
      name: input.name,
      description: input.description ?? null,
      assignedToId: input.assignedTo?.id ?? null,
      dueAt:
        input.dueInDays === undefined
          ? null
          : this.time({ daysAgo: -input.dueInDays }),
      addedById: input.addedBy.id,
      createdAt,
      updatedAt: completedAt ?? createdAt,
      completedAt,
      completedById: input.completedBy?.id ?? null,
    };
    this.state.chores.push(chore);
    return chore;
  }

  shoppingItem(
    household: MockHousehold,
    input: Ago & {
      addedBy: MockUser;
      name: string;
      purchasedBy?: MockUser;
      quantity?: number;
      unit?: string;
    }
  ): MockShoppingItem {
    const item = {
      id: this.id(),
      householdId: household.id,
      name: input.name,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? null,
      addedById: input.addedBy.id,
      addedAt: this.time(input),
      purchasedById: input.purchasedBy?.id ?? null,
      purchasedAt: input.purchasedBy ? this.time() : null,
    };
    this.state.shoppingItems.push(item);
    return item;
  }

  invitation(
    household: MockHousehold,
    input: { email: string; inviter: MockUser; role: HouseholdRole }
  ): MockInvitation {
    const invitation = {
      id: this.id(),
      householdId: household.id,
      email: input.email,
      role: input.role,
      status: "pending" as const,
      inviterId: input.inviter.id,
      createdAt: this.time({ daysAgo: 1 }),
      expiresAt: this.time({ daysAgo: -1 }),
    };
    this.state.invitations.push(invitation);
    return invitation;
  }

  friendship(a: MockUser, b: MockUser, ago: Ago = { daysAgo: 100 }): void {
    this.state.friendships.push({
      id: this.id(),
      userIds: [a.id, b.id],
      createdAt: this.time(ago),
    });
  }

  friendRequest(from: MockUser, to: MockUser, ago: Ago = { daysAgo: 2 }): void {
    this.state.friendRequests.push({
      id: this.id(),
      fromId: from.id,
      toId: to.id,
      createdAt: this.time(ago),
    });
  }

  /** `user` signed in on another device. */
  session(
    user: MockUser,
    device: { ipAddress: string; userAgent: string },
    { signedIn, lastActive }: { lastActive: Ago; signedIn: Ago }
  ): void {
    this.state.otherSessions.push({
      id: this.id(),
      token: `mock-session-${this.id()}`,
      userId: user.id,
      createdAt: this.time(signedIn),
      updatedAt: this.time(lastActive),
      ...device,
    });
  }

  signIn(user: MockUser | null): void {
    this.state.sessionUserId = user?.id ?? null;
  }
}
