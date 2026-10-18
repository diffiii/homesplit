import {
  allocate,
  BalanceListResponse,
  Expense,
  Settlement,
  SettlementListResponse,
  UserBalanceListResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  leaveHousehold,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const householdPath = (household: TestHousehold) =>
  `/api/households/${household.id}`;

interface Spend {
  currency?: string;
  participants: TestUser[];
  payers: [TestUser, number][];
}

/** An expense paid by `payers`, split equally among `participants`. */
const expenseBody = ({ payers, participants, currency = "PLN" }: Spend) => ({
  name: "Groceries",
  expenseDate: "2026-10-01",
  total: {
    amountCents: payers.reduce((sum, [, amountCents]) => sum + amountCents, 0),
    currency,
  },
  payers: payers.map(([payer, amountCents]) => ({
    userId: payer.id,
    amountCents,
  })),
  allocation: {
    method: "equal",
    participants: participants.map(({ id }) => ({ userId: id })),
  },
});

/** Each listed user's balance by currency, keyed by name. */
const byName = ({ items }: BalanceListResponse) =>
  Object.fromEntries(
    items.map(({ currency, balances }) => [
      currency,
      Object.fromEntries(
        balances.map(({ user, amountCents }) => [user.name, amountCents])
      ),
    ])
  );

describe("balances", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Alice owns the household, Carol and Dave are its members, and Bob owns
   * another household.
   */
  async function setup() {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    const dave = await createUser(app, "Dave");
    await inviteAndAccept(alice, alice.household, carol);
    await inviteAndAccept(alice, alice.household, dave);
    return { alice, bob, carol, dave, household: alice.household };
  }

  async function spend(
    author: TestUser,
    household: TestHousehold,
    spec: Spend
  ): Promise<Expense> {
    const response = await author.client
      .post(`${householdPath(household)}/expenses`)
      .send(expenseBody(spec))
      .expect(201);
    return Expense.parse(response.body);
  }

  /** A payment the payee records, so it's confirmed at once. */
  async function pay(
    payee: TestUser,
    household: TestHousehold,
    payer: TestUser,
    amountCents: number,
    currency = "PLN"
  ): Promise<Settlement> {
    const response = await payee.client
      .post(`${householdPath(household)}/settlements`)
      .send({
        payerId: payer.id,
        payeeId: payee.id,
        amount: { amountCents, currency },
      })
      .expect(201);
    return Settlement.parse(response.body);
  }

  async function balances(
    reader: TestUser,
    household: TestHousehold
  ): Promise<BalanceListResponse> {
    const response = await reader.client
      .get(`${householdPath(household)}/balances`)
      .expect(200);
    const parsed = BalanceListResponse.parse(response.body);
    for (const { balances: group } of parsed.items) {
      expect(group.reduce((sum, { amountCents }) => sum + amountCents, 0)).toBe(
        0
      );
    }
    return parsed;
  }

  async function myBalances(
    reader: TestUser
  ): Promise<UserBalanceListResponse> {
    const response = await reader.client.get("/api/me/balances").expect(200);
    return UserBalanceListResponse.parse(response.body);
  }

  describe("household", () => {
    it("computes the worked example and settles it to zero", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(alice, household, {
        payers: [
          [alice, 6000],
          [carol, 3000],
        ],
        participants: [alice, carol, dave],
      });

      expect(await balances(dave, household)).toEqual({
        items: [
          {
            currency: "PLN",
            balances: [
              {
                user: { id: alice.id, name: "Alice", imageUrl: null },
                amountCents: 3000,
              },
              {
                user: { id: carol.id, name: "Carol", imageUrl: null },
                amountCents: 0,
              },
              {
                user: { id: dave.id, name: "Dave", imageUrl: null },
                amountCents: -3000,
              },
            ],
          },
        ],
      });

      await pay(alice, household, dave, 3000);

      expect(await balances(dave, household)).toEqual({ items: [] });
    });

    it("lists nothing for a household without expenses or payments", async () => {
      const { alice, household } = await setup();

      expect(await balances(alice, household)).toEqual({ items: [] });
    });

    it("credits payers who aren't in the allocation", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(carol, household, {
        payers: [
          [dave, 600],
          [carol, 300],
        ],
        participants: [alice, carol],
      });

      expect(byName(await balances(alice, household))).toEqual({
        PLN: { Dave: 600, Carol: -150, Alice: -450 },
      });
    });

    it("keeps the rounding remainder inside the currency's zero sum", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol, dave],
      });

      const shares = new Map(
        allocate(1000, {
          method: "equal",
          participants: [alice, carol, dave].map(({ id }) => ({ userId: id })),
        }).map(({ userId, amountCents }) => [userId, amountCents])
      );

      // One of the three gets the extra unit, and the sum stays zero.
      expect(byName(await balances(alice, household))).toEqual({
        PLN: {
          Alice: 1000 - (shares.get(alice.id) ?? 0),
          Carol: -(shares.get(carol.id) ?? 0),
          Dave: -(shares.get(dave.id) ?? 0),
        },
      });
    });

    it("never nets currencies, and lists them in code order", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 2000]],
        participants: [alice, carol],
        currency: "PLN",
      });
      await spend(carol, household, {
        payers: [[carol, 2000]],
        participants: [alice, carol],
        currency: "EUR",
      });
      await pay(dave, household, alice, 500, "USD");

      const result = await balances(alice, household);

      expect(result.items.map(({ currency }) => currency)).toEqual([
        "EUR",
        "PLN",
        "USD",
      ]);
      expect(byName(result)).toEqual({
        EUR: { Carol: 1000, Dave: 0, Alice: -1000 },
        PLN: { Alice: 1000, Dave: 0, Carol: -1000 },
        USD: { Alice: 500, Carol: 0, Dave: -500 },
      });
    });

    it("orders equal balances by user ID", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 2000]],
        participants: [carol, dave],
      });

      const [{ balances: group }] = (await balances(alice, household)).items;

      expect(group.map(({ user }) => user.id)).toEqual([
        alice.id,
        ...[carol.id, dave.id].sort(),
      ]);
    });

    it("recalculates after an expense is edited or deleted", async () => {
      const { alice, carol, dave, household } = await setup();
      const expense = await spend(alice, household, {
        payers: [[alice, 900]],
        participants: [alice, carol, dave],
      });
      const other = await spend(carol, household, {
        payers: [[carol, 400]],
        participants: [carol, dave],
      });

      await alice.client
        .patch(`${householdPath(household)}/expenses/${expense.id}`)
        .send({
          financial: {
            total: { amountCents: 1200, currency: "PLN" },
            payers: [{ userId: dave.id, amountCents: 1200 }],
            allocation: {
              method: "equal",
              participants: [{ userId: alice.id }, { userId: carol.id }],
            },
          },
        })
        .expect(200);

      expect(byName(await balances(alice, household))).toEqual({
        PLN: { Dave: 1000, Carol: -400, Alice: -600 },
      });

      await carol.client
        .delete(`${householdPath(household)}/expenses/${other.id}`)
        .expect(204);

      expect(byName(await balances(alice, household))).toEqual({
        PLN: { Dave: 1200, Alice: -600, Carol: -600 },
      });
    });

    it("counts repeated payments each time, and pending ones not at all", async () => {
      const { alice, carol, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 2000]],
        participants: [alice, carol],
      });

      await pay(alice, household, carol, 400);
      await pay(alice, household, carol, 400);
      // Recorded by its payer, so it waits for Alice's confirmation.
      const pending = await carol.client
        .post(`${householdPath(household)}/settlements`)
        .send({
          payerId: carol.id,
          payeeId: alice.id,
          amount: { amountCents: 200, currency: "PLN" },
        })
        .expect(201);

      expect(byName(await balances(alice, household))).toEqual({
        PLN: { Alice: 200, Dave: 0, Carol: -200 },
      });

      await alice.client
        .post(
          `${householdPath(household)}/settlements/${pending.body.id}/confirm`
        )
        .expect(200);

      expect(await balances(alice, household)).toEqual({ items: [] });
    });

    it("accepts an overpayment, which turns into a debt the other way", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });

      // Carol owes 500 and pays 800; Alice owes Dave nothing and pays him 100.
      await pay(alice, household, carol, 800);
      await pay(dave, household, alice, 100);

      expect(byName(await balances(alice, household))).toEqual({
        PLN: { Carol: 300, Alice: -200, Dave: -100 },
      });
    });

    it("keeps a payment in history and balances after deleting the expense it settled", async () => {
      const { alice, carol, household } = await setup();
      const expense = await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });
      const payment = await pay(alice, household, carol, 500);

      await alice.client
        .delete(`${householdPath(household)}/expenses/${expense.id}`)
        .expect(204);

      const history = await alice.client
        .get(`${householdPath(household)}/settlements`)
        .expect(200);
      expect(SettlementListResponse.parse(history.body).items).toEqual([
        payment,
      ]);
      // Only the payment is left: Carol sent 500, Alice received it.
      expect(byName(await balances(alice, household))).toEqual({
        PLN: { Carol: 500, Dave: 0, Alice: -500 },
      });
    });

    it("lists departed members only while their balance isn't zero", async () => {
      const { alice, carol, dave, household } = await setup();
      const erin = await createUser(app, "Erin");
      await inviteAndAccept(alice, household, erin);
      await spend(alice, household, {
        payers: [[alice, 900]],
        participants: [alice, carol, dave],
      });
      await spend(alice, household, {
        payers: [[erin, 100]],
        participants: [erin],
      });

      await removeMember(alice, household, dave);
      await leaveHousehold(erin, household);

      expect(byName(await balances(carol, household))).toEqual({
        PLN: { Alice: 600, Carol: -300, Dave: -300 },
      });

      await pay(alice, household, dave, 300);

      expect(byName(await balances(carol, household))).toEqual({
        PLN: { Alice: 300, Carol: -300 },
      });
    });

    it("lists a member who joined later at zero", async () => {
      const { alice, carol, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });
      const erin = await createUser(app, "Erin");
      await inviteAndAccept(alice, household, erin);

      expect(byName(await balances(erin, household)).PLN.Erin).toBe(0);
    });

    it("stays readable while the expenses module is off", async () => {
      const { alice, carol, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });
      await alice.client
        .patch(`${householdPath(household)}/features`)
        .send({ expenses: false })
        .expect(200);

      expect(byName(await balances(carol, household))).toEqual({
        PLN: { Alice: 500, Dave: 0, Carol: -500 },
      });
    });

    it("answers 401 without a session and 404 to non-members", async () => {
      const { alice, bob, carol, household } = await setup();
      await removeMember(alice, household, carol);

      await createClient(app)
        .get(`${householdPath(household)}/balances`)
        .expect(401);
      await bob.client.get(`${householdPath(household)}/balances`).expect(404);
      await carol.client
        .get(`${householdPath(household)}/balances`)
        .expect(404);
    });

    it("hides other households' ledgers", async () => {
      const { alice, bob, carol, household } = await setup();
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });

      expect(await balances(bob, bob.household)).toEqual({ items: [] });
    });
  });

  describe("user", () => {
    it("sums the user's balances across their households by currency", async () => {
      const { alice, bob, carol, household } = await setup();
      const flat = await createHousehold(carol, "Flat");
      await inviteAndAccept(carol, flat, alice);
      await inviteAndAccept(carol, flat, bob);
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });
      await spend(carol, flat, {
        payers: [[carol, 900]],
        participants: [alice, bob, carol],
      });
      await spend(carol, flat, {
        payers: [[carol, 400]],
        participants: [alice, carol],
        currency: "EUR",
      });
      // Bob's own household isn't Alice's, so it never shows up for her.
      await spend(bob, bob.household, {
        payers: [[bob, 500]],
        participants: [bob],
      });

      expect(await myBalances(alice)).toEqual({
        items: [
          {
            currency: "EUR",
            amountCents: -200,
            households: [
              { household: { id: flat.id, name: "Flat" }, amountCents: -200 },
            ],
          },
          {
            currency: "PLN",
            amountCents: 200,
            households: [
              {
                household: { id: household.id, name: "Alice's" },
                amountCents: 500,
              },
              { household: { id: flat.id, name: "Flat" }, amountCents: -300 },
            ],
          },
        ],
      });
      expect(await myBalances(bob)).toEqual({
        items: [
          {
            currency: "PLN",
            amountCents: -300,
            households: [
              { household: { id: flat.id, name: "Flat" }, amountCents: -300 },
            ],
          },
        ],
      });
    });

    it("agrees with each household's balances", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(carol, household, {
        payers: [
          [carol, 700],
          [dave, 500],
        ],
        participants: [alice, carol, dave],
      });
      await pay(carol, household, alice, 150);

      const fromHousehold = byName(await balances(alice, household)).PLN;
      const { items } = await myBalances(alice);

      expect(items).toEqual([
        {
          currency: "PLN",
          amountCents: fromHousehold.Alice,
          households: [
            {
              household: { id: household.id, name: "Alice's" },
              amountCents: fromHousehold.Alice,
            },
          ],
        },
      ]);
    });

    it("leaves out settled balances and households the user has left", async () => {
      const { alice, carol, dave, household } = await setup();
      const flat = await createHousehold(dave, "Flat");
      await inviteAndAccept(dave, flat, carol);
      await spend(alice, household, {
        payers: [[alice, 1000]],
        participants: [alice, carol],
      });
      await pay(alice, household, carol, 500);
      await spend(dave, flat, {
        payers: [[dave, 1000]],
        participants: [carol, dave],
      });

      await removeMember(dave, flat, carol);

      expect(await myBalances(carol)).toEqual({ items: [] });
      // Dave still sees Carol's debt in the household she was removed from.
      expect(await myBalances(dave)).toMatchObject({
        items: [{ currency: "PLN", amountCents: 500 }],
      });
    });

    it("lists nothing for a user without households", async () => {
      const erin = await createUser(app, "Erin");

      expect(await myBalances(erin)).toEqual({ items: [] });
    });

    it("answers 401 without a session", async () => {
      await createClient(app).get("/api/me/balances").expect(401);
    });
  });
});
