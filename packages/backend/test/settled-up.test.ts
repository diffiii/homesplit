import { ApiError, HouseholdFeatures } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { member, organization, settlements } from "@/db/schema";
import { lockHouseholdForLedgerWrite } from "@/features/expenses/household-ledger-lock";
import { createTestApp } from "./helpers/app";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  leaveHousehold,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

const householdPath = (household: TestHousehold) =>
  `/api/households/${household.id}`;

function expectApiError(response: Response, code: string): ApiError {
  const error = ApiError.parse(response.body);
  expect(error.code).toBe(code);
  return error;
}

const householdExists = async (household: TestHousehold) =>
  (await db.$count(organization, eq(organization.id, household.id))) > 0;

const isMember = async (household: TestHousehold, user: TestUser) =>
  (await db.$count(
    member,
    and(eq(member.organizationId, household.id), eq(member.userId, user.id))
  )) > 0;

describe("settled-up checks", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Alice owns the household, and Carol and Dave are its members. */
  async function setup() {
    const { alice } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    const dave = await createUser(app, "Dave");
    await inviteAndAccept(alice, alice.household, carol);
    await inviteAndAccept(alice, alice.household, dave);
    return { alice, carol, dave, household: alice.household };
  }

  /** `payer` pays `amountCents`, split equally between them and `debtor`. */
  async function spend(
    household: TestHousehold,
    payer: TestUser,
    debtor: TestUser,
    amountCents: number,
    currency = "PLN"
  ): Promise<void> {
    await payer.client
      .post(`${householdPath(household)}/expenses`)
      .send({
        name: "Groceries",
        expenseDate: "2026-10-01",
        total: { amountCents, currency },
        payers: [{ userId: payer.id, amountCents }],
        allocation: {
          method: "equal",
          participants: [{ userId: payer.id }, { userId: debtor.id }],
        },
      })
      .expect(201);
  }

  /** A payment the payee records, so it's confirmed at once. */
  async function pay(
    household: TestHousehold,
    payer: TestUser,
    payee: TestUser,
    amountCents: number,
    currency = "PLN"
  ): Promise<void> {
    await payee.client
      .post(`${householdPath(household)}/settlements`)
      .send({
        payerId: payer.id,
        payeeId: payee.id,
        amount: { amountCents, currency },
      })
      .expect(201);
  }

  const disableExpenses = (admin: TestUser, household: TestHousehold) =>
    admin.client
      .patch(`${householdPath(household)}/features`)
      .send({ expenses: false });

  const leave = (user: TestUser, household: TestHousehold) =>
    user.client
      .post("/api/auth/organization/leave")
      .send({ organizationId: household.id });

  describe("deleting a household", () => {
    it("refuses while any balance isn't zero, then deletes once settled", async () => {
      const { alice, carol, household } = await setup();
      await spend(household, alice, carol, 1000);

      const refused = await alice.client
        .delete(householdPath(household))
        .expect(409);

      expectApiError(refused, "HOUSEHOLD_HAS_UNSETTLED_BALANCES");
      expect(await householdExists(household)).toBe(true);

      await pay(household, carol, alice, 500);
      await alice.client.delete(householdPath(household)).expect(204);

      expect(await householdExists(household)).toBe(false);
    });

    it("counts departed members' balances", async () => {
      const { alice, dave, household } = await setup();
      await spend(household, alice, dave, 1000);
      await removeMember(alice, household, dave);

      const response = await alice.client
        .delete(householdPath(household))
        .expect(409);

      expectApiError(response, "HOUSEHOLD_HAS_UNSETTLED_BALANCES");
    });

    it("counts every currency on its own", async () => {
      const { alice, carol, household } = await setup();
      await spend(household, alice, carol, 1000, "PLN");
      // Carol pays back the same amount, but in another currency.
      await pay(household, carol, alice, 500, "EUR");

      await alice.client.delete(householdPath(household)).expect(409);
    });

    it("ignores pending payments", async () => {
      const { alice, carol, household } = await setup();
      // Recorded by its payer, so it waits for confirmation.
      await carol.client
        .post(`${householdPath(household)}/settlements`)
        .send({
          payerId: carol.id,
          payeeId: alice.id,
          amount: { amountCents: 500, currency: "PLN" },
        })
        .expect(201);

      await alice.client.delete(householdPath(household)).expect(204);
    });

    it("waits for a ledger write in progress and sees what it committed", async () => {
      const { alice, carol, household } = await setup();

      const response = await sendDuring(
        async (tx) => {
          await lockHouseholdForLedgerWrite(tx, household.id);
          await tx.insert(settlements).values({
            householdId: household.id,
            payerId: carol.id,
            payeeId: alice.id,
            createdById: alice.id,
            amountCents: 500n,
            currency: "PLN",
            confirmedById: alice.id,
            confirmedAt: new Date(),
          });
        },
        () => alice.client.delete(householdPath(household))
      );

      expect(response.status).toBe(409);
      expect(await householdExists(household)).toBe(true);
    });
  });

  describe("turning off expenses", () => {
    it("refuses while any balance isn't zero, and keeps the flag on", async () => {
      const { alice, carol, household } = await setup();
      await spend(household, alice, carol, 1000);

      const response = await disableExpenses(alice, household).expect(409);

      expectApiError(response, "HOUSEHOLD_HAS_UNSETTLED_BALANCES");
      const features = await alice.client
        .get(`${householdPath(household)}/features`)
        .expect(200);
      expect(HouseholdFeatures.parse(features.body).expenses).toBe(true);
    });

    it("still lets other flags change, and expenses turn off once settled", async () => {
      const { alice, carol, household } = await setup();
      await spend(household, alice, carol, 1000);

      await alice.client
        .patch(`${householdPath(household)}/features`)
        .send({ chores: false, expenses: true })
        .expect(200);

      await pay(household, carol, alice, 500);
      const response = await disableExpenses(alice, household).expect(200);

      expect(HouseholdFeatures.parse(response.body)).toEqual({
        expenses: false,
        chores: false,
        shopping: true,
        ai: false,
      });
    });
  });

  describe("leaving", () => {
    it("refuses while the member's balance isn't zero, then lets them go", async () => {
      const { alice, carol, household } = await setup();
      await spend(household, alice, carol, 1000);

      const refused = await leave(carol, household).expect(409);

      expect(refused.body).toMatchObject({ code: "UNSETTLED_BALANCE" });
      expect(await isMember(household, carol)).toBe(true);

      await pay(household, carol, alice, 500);
      await leaveHousehold(carol, household);

      expect(await isMember(household, carol)).toBe(false);
    });

    it("refuses a member who is owed money too", async () => {
      const { alice, carol, household } = await setup();
      await spend(household, carol, alice, 1000);

      await leave(carol, household).expect(409);
    });

    it("ignores other members' balances", async () => {
      const { alice, carol, dave, household } = await setup();
      await spend(household, alice, carol, 1000);

      await leaveHousehold(dave, household);

      expect(await isMember(household, dave)).toBe(false);
    });

    it("answers 400 to a malformed household ID", async () => {
      const { carol } = await setup();

      const response = await carol.client
        .post("/api/auth/organization/leave")
        .send({ organizationId: "not-a-uuid" })
        .expect(400);

      expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });
});
