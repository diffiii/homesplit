import type { MockState } from "./db";
import { MockFactory } from "./factories";

export interface Scenario {
  build: () => MockState;
  description: string;
  label: string;
}

/**
 * Two households that between them hold every case the UI must handle:
 * - Flat on Piękna: Alice is the owner, Bartek an admin, Celina a member,
 *   and Dawid has left while still owing money. Expenses in PLN and EUR,
 *   over a page of them, with every split method; pending and confirmed
 *   payments; open, overdue, unassigned, and completed chores; bought and
 *   unbought shopping; a pending invitation.
 * - Lake cabin: Ewa is the owner and Alice a member, with chores turned off
 *   but still holding chores, and expenses in EUR and PLN.
 * - Book club: Filip's household, where Alice has a pending invitation.
 *
 * Alice is also signed in on a phone and on a Windows laptop.
 */
function households(): MockState {
  const f = new MockFactory();
  const alice = f.user("Alice Nowak", "alice@example.com");
  const bartek = f.user("Bartek Kowalski", "bartek@example.com");
  const celina = f.user("Celina Wiśniewska", "celina@example.com");
  const dawid = f.user("Dawid Lewandowski", "dawid@example.com");
  const ewa = f.user("Ewa Zielińska", "ewa@example.com");
  const filip = f.user("Filip Wójcik", "filip@example.com");

  const flat = f.household("Flat on Piękna");
  f.join(flat, alice, "owner", { daysAgo: 365 });
  f.join(flat, bartek, "admin", { daysAgo: 360 });
  f.join(flat, celina, "member", { daysAgo: 200 });
  f.join(flat, dawid, "member", { daysAgo: 150 });

  const flatmates = [alice, bartek, celina];
  f.expense(flat, {
    author: alice,
    name: "Rent, August",
    amountCents: 450_000,
    category: "Rent",
    participants: [...flatmates, dawid],
    daysAgo: 80,
  });
  f.expense(flat, {
    author: dawid,
    name: "Internet",
    amountCents: 8999,
    category: "Utilities",
    participants: [...flatmates, dawid],
    daysAgo: 70,
  });
  f.leave(flat, dawid);

  const groceries = ["Biedronka", "Lidl", "Żabka", "Market", "Auchan"];
  for (let i = 0; i < 20; i += 1) {
    const payer = flatmates[i % flatmates.length];
    f.expense(flat, {
      author: payer,
      name: groceries[i % groceries.length],
      amountCents: 4321 + i * 1013,
      category: "Groceries",
      participants: flatmates,
      daysAgo: 60 - i * 3,
    });
  }
  f.expense(flat, {
    author: bartek,
    name: "Electricity",
    description: "September and October",
    amountCents: 31_250,
    category: "Utilities",
    allocation: {
      method: "shares",
      participants: [
        { userId: alice.id, shares: 2 },
        { userId: bartek.id, shares: 1 },
        { userId: celina.id, shares: 1 },
      ],
    },
    daysAgo: 5,
  });
  f.expense(flat, {
    author: celina,
    name: "Pizza night",
    amountCents: 12_900,
    category: "Dining out",
    payers: [
      [celina, 9000],
      [alice, 3900],
    ],
    allocation: {
      method: "exact",
      participants: [
        { userId: alice.id, amountCents: 3900 },
        { userId: bartek.id, amountCents: 4500 },
        { userId: celina.id, amountCents: 4500 },
      ],
    },
    daysAgo: 2,
  });
  f.expense(flat, {
    author: alice,
    name: "Ferry tickets",
    amountCents: 18_000,
    currency: "EUR",
    category: "Transport",
    allocation: {
      method: "percentage",
      participants: [
        { userId: alice.id, basisPoints: 5000 },
        { userId: bartek.id, basisPoints: 2500 },
        { userId: celina.id, basisPoints: 2500 },
      ],
    },
    daysAgo: 1,
  });
  f.expense(flat, {
    author: bartek,
    name: "Cleaning supplies",
    amountCents: 6000,
    allocation: {
      method: "adjustment",
      participants: [
        { userId: alice.id, adjustmentCents: 0 },
        { userId: bartek.id, adjustmentCents: 1000 },
        { userId: celina.id, adjustmentCents: -1000 },
      ],
    },
    daysAgo: 1,
  });

  f.settlement(flat, {
    payer: bartek,
    payee: alice,
    amountCents: 50_000,
    confirmed: true,
    daysAgo: 30,
  });
  f.settlement(flat, {
    payer: celina,
    payee: alice,
    amountCents: 20_000,
    confirmed: false,
    note: "BLIK",
    hoursAgo: 3,
  });

  f.chore(flat, {
    name: "Take out the bins",
    addedBy: alice,
    assignedTo: bartek,
    dueInDays: -1,
    daysAgo: 7,
  });
  f.chore(flat, {
    name: "Clean the bathroom",
    description: "Including the mirror and the shower drain.",
    addedBy: celina,
    assignedTo: alice,
    dueInDays: 2,
    daysAgo: 4,
  });
  f.chore(flat, {
    name: "Water the plants",
    addedBy: bartek,
    daysAgo: 10,
  });
  f.chore(flat, {
    name: "Fix the wardrobe door",
    addedBy: alice,
    assignedTo: dawid,
    dueInDays: 14,
    daysAgo: 90,
  });
  f.chore(flat, {
    name: "Defrost the freezer",
    addedBy: alice,
    assignedTo: celina,
    completedBy: celina,
    daysAgo: 12,
  });

  f.shoppingItem(flat, {
    name: "Milk",
    quantity: 2,
    unit: "l",
    addedBy: alice,
    daysAgo: 2,
  });
  f.shoppingItem(flat, { name: "Bread", addedBy: celina, daysAgo: 1 });
  f.shoppingItem(flat, {
    name: "Coffee beans",
    quantity: 500,
    unit: "g",
    addedBy: bartek,
    hoursAgo: 5,
  });
  f.shoppingItem(flat, {
    name: "Dish soap",
    addedBy: bartek,
    purchasedBy: alice,
    daysAgo: 3,
  });
  f.shoppingItem(flat, {
    name: "Eggs",
    quantity: 10,
    addedBy: alice,
    purchasedBy: celina,
    daysAgo: 4,
  });

  f.invitation(flat, {
    email: "ewa@example.com",
    inviter: bartek,
    role: "member",
  });

  const cabin = f.household("Lake cabin", { chores: false }, { daysAgo: 120 });
  f.join(cabin, ewa, "owner", { daysAgo: 120 });
  f.join(cabin, alice, "member", { daysAgo: 110 });
  f.join(cabin, bartek, "member", { daysAgo: 100 });
  f.expense(cabin, {
    author: ewa,
    name: "Cabin rental",
    amountCents: 96_000,
    currency: "EUR",
    category: "Rent",
    participants: [ewa, alice, bartek],
    daysAgo: 40,
  });
  f.expense(cabin, {
    author: alice,
    name: "Firewood",
    amountCents: 15_000,
    category: "Other",
    participants: [ewa, alice, bartek],
    daysAgo: 39,
  });
  f.chore(cabin, {
    name: "Close the shutters",
    addedBy: ewa,
    assignedTo: alice,
    daysAgo: 38,
  });
  f.shoppingItem(cabin, { name: "Matches", addedBy: ewa, daysAgo: 38 });

  const club = f.household("Book club", {}, { daysAgo: 20 });
  f.join(club, filip, "owner", { daysAgo: 20 });
  f.invitation(club, {
    email: "alice@example.com",
    inviter: filip,
    role: "member",
  });

  f.friendship(alice, bartek);
  f.friendship(alice, ewa);
  f.friendRequest(filip, alice);
  f.friendRequest(alice, celina);

  f.session(
    alice,
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ipAddress: "203.0.113.7",
    },
    { signedIn: { daysAgo: 5 }, lastActive: { hoursAgo: 3 } }
  );
  f.session(
    alice,
    {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
      ipAddress: "198.51.100.24",
    },
    { signedIn: { daysAgo: 6 }, lastActive: { daysAgo: 4 } }
  );

  f.signIn(alice);
  return f.state;
}

function newUser(): MockState {
  const f = new MockFactory();
  f.signIn(f.user("Nina Kaczmarek", "nina@example.com"));
  return f.state;
}

function signedOut(): MockState {
  const state = households();
  state.sessionUserId = null;
  return state;
}

/** Data sets to switch between on `/dev/mocks`, or with `scenario` in tests. */
export const SCENARIOS = {
  households: {
    label: "Two households",
    description:
      "Signed in as Alice: owner of one household, member of another with chores off, and invited to a third.",
    build: households,
  },
  "new-user": {
    label: "New user",
    description: "Signed in as Nina, who has no households or friends yet.",
    build: newUser,
  },
  "signed-out": {
    label: "Signed out",
    description: "The two-household data with nobody signed in.",
    build: signedOut,
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;

export const DEFAULT_SCENARIO: ScenarioName = "households";

export function isScenarioName(name: unknown): name is ScenarioName {
  return typeof name === "string" && Object.hasOwn(SCENARIOS, name);
}
