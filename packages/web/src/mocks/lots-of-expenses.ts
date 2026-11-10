import type {
  CurrencyCode,
  ExpenseAllocationInput,
} from "@homesplit/contracts";
import type { MockHousehold, MockState, MockUser } from "./db";
import { type ExpenseInput, MockFactory } from "./factories";

/** How far back the history goes; just under the factory's user accounts. */
const HISTORY_DAYS = 390;
const DAWID_LEFT_DAYS_AGO = 200;
const EWA_JOINED_DAYS_AGO = 200;
const FILIP_JOINED_DAYS_AGO = 60;

type SplitMethod = ExpenseAllocationInput["method"];

/** A seeded generator, so a build holds the same data apart from its dates. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

type Random = ReturnType<typeof seededRandom>;

const between = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));

const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)];

/** `total` in `parts` uneven positive pieces, given a `total` far above `parts`. */
function cut(random: Random, total: number, parts: number): number[] {
  let remaining = total;
  return Array.from({ length: parts }, (_, i) => {
    if (i === parts - 1) {
      return remaining;
    }
    const piece = Math.max(1, Math.floor(remaining * (0.2 + random() * 0.4)));
    remaining -= piece;
    return piece;
  });
}

function allocation(
  random: Random,
  method: SplitMethod,
  people: MockUser[],
  total: number
): ExpenseAllocationInput {
  switch (method) {
    case "equal":
      return {
        method,
        participants: people.map(({ id }) => ({ userId: id })),
      };
    case "shares":
      return {
        method,
        participants: people.map(({ id }) => ({
          userId: id,
          shares: between(random, 1, 4),
        })),
      };
    case "percentage": {
      const basisPoints = cut(random, 10_000, people.length);
      return {
        method,
        participants: people.map(({ id }, i) => ({
          userId: id,
          basisPoints: basisPoints[i],
        })),
      };
    }
    case "exact": {
      const amounts = cut(random, total, people.length);
      return {
        method,
        participants: people.map(({ id }, i) => ({
          userId: id,
          amountCents: amounts[i],
        })),
      };
    }
    default: {
      // One pays more and another less, by little enough to keep shares positive.
      const adjustment = Math.floor(total / 10);
      return {
        method,
        participants: people.map(({ id }, i) => {
          const offsets = [adjustment, -adjustment];
          return { userId: id, adjustmentCents: offsets[i] ?? 0 };
        }),
      };
    }
  }
}

/** Mostly equal splits, as people really enter them, with every other method. */
const SPLIT_METHODS: SplitMethod[] = [
  "equal",
  "equal",
  "equal",
  "equal",
  "equal",
  "equal",
  "shares",
  "percentage",
  "exact",
  "adjustment",
];

/** A random author, split, and sometimes a second payer or a smaller group. */
function randomExpense(
  random: Random,
  roster: MockUser[],
  fields: {
    category?: string;
    currency?: CurrencyCode;
    description?: string;
    hoursAgo: number;
    daysAgo: number;
    amountCents: number;
    name: string;
  }
): ExpenseInput {
  const author = pick(random, roster);
  const others = roster.filter(({ id }) => id !== author.id);
  const skipped =
    random() < 0.2 && roster.length > 2 ? pick(random, others) : null;
  const people = roster.filter(({ id }) => id !== skipped?.id);
  const secondPayer = random() < 0.12 ? pick(random, others) : null;
  const [paidByAuthor, paidBySecond] = cut(random, fields.amountCents, 2);
  return {
    ...fields,
    author,
    payers: secondPayer
      ? [
          [author, paidByAuthor],
          [secondPayer, paidBySecond],
        ]
      : undefined,
    allocation: allocation(
      random,
      pick(random, SPLIT_METHODS),
      people,
      fields.amountCents
    ),
  };
}

interface Spending {
  category?: string;
  maxCents: number;
  minCents: number;
  names: string[];
  /** How often this kind comes up, against the other kinds. */
  weight: number;
}

const HOUSE_SPENDING: Spending[] = [
  {
    category: "Groceries",
    names: [
      "Biedronka",
      "Lidl",
      "Żabka",
      "Auchan",
      "Carrefour",
      "Farmers' market",
      "Bakery",
      "Weekly groceries",
    ],
    minCents: 1200,
    maxCents: 48_000,
    weight: 10,
  },
  {
    category: "Dining out",
    names: [
      "Pizza night",
      "Sushi delivery",
      "Pierogi on Floriańska",
      "Brunch",
      "Kebab after the concert",
      "Coffee and cake",
    ],
    minCents: 3500,
    maxCents: 32_000,
    weight: 4,
  },
  {
    category: "Transport",
    names: [
      "Fuel",
      "Bolt to the airport",
      "Tram passes",
      "Parking",
      "Car wash",
    ],
    minCents: 800,
    maxCents: 36_000,
    weight: 3,
  },
  {
    category: "Entertainment",
    names: ["Cinema", "Netflix", "Spotify", "Concert tickets", "Bowling"],
    minCents: 2000,
    maxCents: 40_000,
    weight: 2,
  },
  {
    category: "Utilities",
    names: ["Water bill", "Light bulbs", "Chimney sweep", "Boiler service"],
    minCents: 1500,
    maxCents: 60_000,
    weight: 1,
  },
  {
    category: "Other",
    names: ["Pharmacy", "Birthday present", "IKEA run", "Bike repair"],
    minCents: 1000,
    maxCents: 90_000,
    weight: 2,
  },
  {
    names: ["Cleaning supplies", "Laundry detergent", "Spare keys", "Stamps"],
    minCents: 500,
    maxCents: 8000,
    weight: 2,
  },
];

const TRIP_SPENDING: Spending[] = [
  {
    category: "Rent",
    names: ["Hotel", "Apartment", "City tax"],
    minCents: 8000,
    maxCents: 60_000,
    weight: 2,
  },
  {
    category: "Dining out",
    names: ["Dinner", "Lunch", "Breakfast", "Drinks", "Street food"],
    minCents: 1500,
    maxCents: 18_000,
    weight: 6,
  },
  {
    category: "Transport",
    names: ["Metro tickets", "Taxi", "Car rental", "Train"],
    minCents: 500,
    maxCents: 30_000,
    weight: 3,
  },
  {
    category: "Entertainment",
    names: ["Museum", "Boat tour", "Guided walk"],
    minCents: 1500,
    maxCents: 16_000,
    weight: 2,
  },
  {
    names: ["Sunscreen", "Souvenirs", "Laundrette"],
    minCents: 500,
    maxCents: 5000,
    weight: 1,
  },
];

const byWeight = (kinds: Spending[]) =>
  kinds.flatMap((kind) => Array.from({ length: kind.weight }, () => kind));

const DESCRIPTIONS = [
  "Receipt is on the fridge.",
  "Split as we agreed on Sunday.",
  "Includes the deposit, which we get back when we return the bottles.",
  "Paid by card, so the amount may differ by a few groszy from the receipt.",
];

function houseRoster(
  daysAgo: number,
  { alice, bartek, celina, dawid, ewa, filip }: Record<string, MockUser>
): MockUser[] {
  if (daysAgo > DAWID_LEFT_DAYS_AGO) {
    return [alice, bartek, celina, dawid];
  }
  return daysAgo > FILIP_JOINED_DAYS_AGO
    ? [alice, bartek, celina, ewa]
    : [alice, bartek, celina, ewa, filip];
}

/** A year of shared bills and everyday spending, with some of every split. */
function seedHouse(
  f: MockFactory,
  random: Random,
  house: MockHousehold,
  users: Record<string, MockUser>
) {
  const everyday = byWeight(HOUSE_SPENDING);
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    const roster = houseRoster(daysAgo, users);
    if (daysAgo % 30 === 0) {
      for (const [name, category, amountCents] of [
        ["Rent", "Rent", 480_000],
        ["Internet", "Utilities", 8999],
        ["Electricity", "Utilities", between(random, 15_000, 45_000)],
      ] as const) {
        f.expense(house, {
          author: users.alice,
          name,
          category,
          amountCents,
          participants: roster,
          daysAgo,
        });
      }
    }
    const count = between(random, 1, 4);
    for (let i = 0; i < count; i += 1) {
      const kind = pick(random, everyday);
      f.expense(
        house,
        randomExpense(random, roster, {
          name: pick(random, kind.names),
          category: kind.category,
          // Some foreign spending, so PLN isn't the only balance.
          currency: random() < 0.04 ? pick(random, ["EUR", "GBP"]) : undefined,
          description: random() < 0.15 ? pick(random, DESCRIPTIONS) : undefined,
          amountCents: between(random, kind.minCents, kind.maxCents),
          daysAgo,
          hoursAgo: i,
        })
      );
    }
  }

  // The extremes a list has to lay out.
  f.expense(house, {
    author: users.alice,
    name: "New boiler, including installation, the old one's removal, and the gas safety inspection the landlord asked for in the spring",
    description:
      "The landlord pays half of this back in instalments, which we agreed to record as payments once they arrive. Invoice and warranty are in the kitchen drawer, and the installer's number is on the boiler itself.",
    amountCents: 2_499_999,
    category: "Utilities",
    participants: houseRoster(3, users),
    daysAgo: 3,
  });
  f.expense(house, {
    author: users.celina,
    name: "Bottle deposit",
    amountCents: 1,
    participants: houseRoster(1, users),
    daysAgo: 1,
  });
}

/** Trips in other currencies, including one without a minor unit. */
function seedTrips(
  f: MockFactory,
  random: Random,
  trips: MockHousehold,
  roster: MockUser[]
) {
  const spending = byWeight(TRIP_SPENDING);
  for (const { place, currency, startDaysAgo, days, scale } of [
    { place: "Lisbon", currency: "EUR", startDaysAgo: 340, days: 10, scale: 1 },
    { place: "London", currency: "GBP", startDaysAgo: 250, days: 8, scale: 1 },
    { place: "Kyoto", currency: "JPY", startDaysAgo: 150, days: 14, scale: 2 },
    { place: "New York", currency: "USD", startDaysAgo: 40, days: 9, scale: 1 },
  ]) {
    for (let day = 0; day < days; day += 1) {
      const count = between(random, 3, 7);
      for (let i = 0; i < count; i += 1) {
        const kind = pick(random, spending);
        f.expense(
          trips,
          randomExpense(random, roster, {
            name: `${pick(random, kind.names)}, ${place}`,
            category: kind.category,
            currency,
            amountCents: between(random, kind.minCents, kind.maxCents) * scale,
            daysAgo: startDaysAgo - day,
            hoursAgo: i,
          })
        );
      }
    }
  }
}

/**
 * Over a thousand expenses, for the list, its filters, and the balances:
 * - Shared house: Alice is the owner and Bartek an admin. A year of bills and
 *   everyday spending, mostly in PLN, with every split method, second payers,
 *   and a roster that changes: Dawid left, Ewa and Filip joined later.
 * - Trips: Alice is a member, with spending in EUR, GBP, JPY, and USD.
 *
 * Chores and shopping are left empty, since `households` covers those.
 */
export function lotsOfExpenses(): MockState {
  const f = new MockFactory();
  const random = seededRandom(20_261_106);
  const users = {
    alice: f.user("Alice Nowak", "alice@example.com"),
    bartek: f.user("Bartek Kowalski", "bartek@example.com"),
    celina: f.user("Celina Wiśniewska", "celina@example.com"),
    dawid: f.user("Dawid Lewandowski", "dawid@example.com"),
    ewa: f.user("Ewa Zielińska", "ewa@example.com"),
    filip: f.user("Filip Wójcik", "filip@example.com"),
  };
  const { alice, bartek, celina, dawid, ewa, filip } = users;

  const house = f.household("Shared house", {}, { daysAgo: HISTORY_DAYS });
  f.join(house, alice, "owner", { daysAgo: HISTORY_DAYS });
  f.join(house, bartek, "admin", { daysAgo: HISTORY_DAYS });
  f.join(house, celina, "member", { daysAgo: HISTORY_DAYS });
  f.join(house, dawid, "member", { daysAgo: HISTORY_DAYS });
  f.join(house, ewa, "member", { daysAgo: EWA_JOINED_DAYS_AGO });
  f.join(house, filip, "member", { daysAgo: FILIP_JOINED_DAYS_AGO });
  seedHouse(f, random, house, users);
  f.leave(house, dawid);

  for (let daysAgo = 330; daysAgo > 0; daysAgo -= 30) {
    f.settlement(house, {
      payer: daysAgo > EWA_JOINED_DAYS_AGO ? bartek : ewa,
      payee: alice,
      amountCents: between(random, 20_000, 150_000),
      confirmed: true,
      note: random() < 0.5 ? "BLIK" : undefined,
      daysAgo,
    });
  }
  f.settlement(house, {
    payer: celina,
    payee: alice,
    amountCents: 75_000,
    confirmed: false,
    note: "Transfer on Friday",
    hoursAgo: 5,
  });

  const trips = f.household("Trips", {}, { daysAgo: HISTORY_DAYS });
  f.join(trips, bartek, "owner", { daysAgo: HISTORY_DAYS });
  f.join(trips, alice, "member", { daysAgo: HISTORY_DAYS });
  f.join(trips, ewa, "member", { daysAgo: HISTORY_DAYS });
  seedTrips(f, random, trips, [alice, bartek, ewa]);

  f.signIn(alice);
  return f.state;
}
