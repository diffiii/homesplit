import {
  BalanceListResponse,
  SettlementListResponse,
  WriteOffResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { settlements } from "@/db/schema";
import { lockHouseholdForLedgerWrite } from "@/features/expenses/household-ledger-lock";
import { expectApiError } from "./helpers/api";
import { createTestApp } from "./helpers/app";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

const householdPath = (household: TestHousehold) =>
  `/api/households/${household.id}`;

describe("write-offs", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Alice owns the household and Carol and Dave are its members. `payer`
   * pays 900 split equally among the three, then Dave is removed.
   */
  async function setup(payer: "alice" | "dave" = "alice") {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    const dave = await createUser(app, "Dave");
    const { household } = alice;
    await inviteAndAccept(alice, household, carol);
    await inviteAndAccept(alice, household, dave);
    const users = { alice, carol, dave };
    await users[payer].client
      .post(`${householdPath(household)}/expenses`)
      .send({
        name: "Groceries",
        expenseDate: "2026-10-01",
        total: { amountCents: 900, currency: "PLN" },
        payers: [{ userId: users[payer].id, amountCents: 900 }],
        allocation: {
          method: "equal",
          participants: [alice, carol, dave].map(({ id }) => ({ userId: id })),
        },
      })
      .expect(201);
    await removeMember(alice, household, dave);
    return { alice, bob, carol, dave, household };
  }

  const writeOff = (caller: TestUser, household: TestHousehold, body: object) =>
    caller.client.post(`${householdPath(household)}/write-offs`).send(body);

  /** Each listed user's PLN balance, keyed by name. */
  async function balances(reader: TestUser, household: TestHousehold) {
    const response = await reader.client
      .get(`${householdPath(household)}/balances`)
      .expect(200);
    const pln = BalanceListResponse.parse(response.body).items.find(
      ({ currency }) => currency === "PLN"
    );
    return Object.fromEntries(
      (pln?.balances ?? []).map(({ user, amountCents }) => [
        user.name,
        amountCents,
      ])
    );
  }

  async function settlementCount(reader: TestUser, household: TestHousehold) {
    const response = await reader.client
      .get(`${householdPath(household)}/settlements`)
      .expect(200);
    return SettlementListResponse.parse(response.body).totalItems;
  }

  it("forgives a debt with confirmed payments to the creditors", async () => {
    const { alice, carol, dave, household } = await setup();

    const response = await writeOff(alice, household, {
      userId: dave.id,
      currency: "PLN",
      method: "forgive",
      amountCents: -300,
    }).expect(201);

    const { items } = WriteOffResponse.parse(response.body);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      payer: { id: dave.id },
      payee: { id: alice.id },
      createdBy: { id: alice.id },
      confirmedBy: { id: alice.id },
      amount: { amountCents: 300, currency: "PLN" },
      note: "Write-off",
    });
    expect(await balances(carol, household)).toEqual({
      Alice: 300,
      Carol: -300,
    });
  });

  it("splits a debt equally among current members", async () => {
    const { alice, carol, dave, household } = await setup();

    await writeOff(alice, household, {
      userId: dave.id,
      currency: "PLN",
      method: "split",
      amountCents: -300,
    }).expect(201);

    expect(await balances(carol, household)).toEqual({
      Alice: 450,
      Carol: -450,
    });
  });

  it("confirms payments the caller makes to a departed creditor", async () => {
    const { alice, carol, dave, household } = await setup("dave");

    const response = await writeOff(alice, household, {
      userId: dave.id,
      currency: "PLN",
      method: "forgive",
      amountCents: 600,
    }).expect(201);

    const { items } = WriteOffResponse.parse(response.body);
    expect(items.map(({ payer }) => payer.id).sort()).toEqual(
      [alice.id, carol.id].sort()
    );
    expect(await balances(carol, household)).toEqual({});
  });

  it("records nothing when the balance has changed, so a repeat is safe", async () => {
    const { alice, dave, household } = await setup();
    const body = {
      userId: dave.id,
      currency: "PLN",
      method: "forgive",
      amountCents: -300,
    };

    expectApiError(
      await writeOff(alice, household, { ...body, amountCents: -200 }).expect(
        409
      ),
      "BALANCE_CHANGED"
    );
    await writeOff(alice, household, body).expect(201);
    expectApiError(
      await writeOff(alice, household, body).expect(409),
      "BALANCE_CHANGED"
    );
    expect(await settlementCount(alice, household)).toBe(1);
  });

  it("records one write-off when the same request arrives twice at once", async () => {
    const { alice, dave, household } = await setup();
    const body = {
      userId: dave.id,
      currency: "PLN",
      method: "split",
      amountCents: -300,
    };

    const responses = await Promise.all([
      writeOff(alice, household, body),
      writeOff(alice, household, body),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await settlementCount(alice, household)).toBe(2);
  });

  it("waits for a ledger write in progress and sees what it committed", async () => {
    const { alice, dave, household } = await setup();

    const response = await sendDuring(
      async (tx) => {
        await lockHouseholdForLedgerWrite(tx, household.id);
        await tx.insert(settlements).values({
          householdId: household.id,
          payerId: dave.id,
          payeeId: alice.id,
          createdById: alice.id,
          amountCents: 100n,
          currency: "PLN",
          confirmedById: alice.id,
          confirmedAt: new Date(),
        });
      },
      () =>
        writeOff(alice, household, {
          userId: dave.id,
          currency: "PLN",
          method: "forgive",
          amountCents: -300,
        })
    );

    expect(response.status).toBe(409);
    expectApiError(response, "BALANCE_CHANGED");
    const writeOffs = await db
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.householdId, household.id),
          eq(settlements.note, "Write-off")
        )
      );
    expect(writeOffs).toEqual([]);
  });

  it("refuses while the member has pending payments", async () => {
    const { alice, carol, dave, household } = await setup();
    // Recorded by its payer, so it waits for confirmation.
    await carol.client
      .post(`${householdPath(household)}/settlements`)
      .send({
        payerId: carol.id,
        payeeId: dave.id,
        amount: { amountCents: 100, currency: "PLN" },
      })
      .expect(201);

    expectApiError(
      await writeOff(alice, household, {
        userId: dave.id,
        currency: "PLN",
        method: "forgive",
        amountCents: -300,
      }).expect(409),
      "HAS_PENDING_PAYMENTS"
    );
  });

  it("ignores pending payments in another currency", async () => {
    const { alice, carol, dave, household } = await setup();
    await carol.client
      .post(`${householdPath(household)}/settlements`)
      .send({
        payerId: carol.id,
        payeeId: dave.id,
        amount: { amountCents: 100, currency: "EUR" },
      })
      .expect(201);

    await writeOff(alice, household, {
      userId: dave.id,
      currency: "PLN",
      method: "forgive",
      amountCents: -300,
    }).expect(201);
  });

  it("only writes off departed members", async () => {
    const { alice, bob, carol, household } = await setup();
    const body = { currency: "PLN", method: "split", amountCents: -300 };

    expectApiError(
      await writeOff(alice, household, { ...body, userId: carol.id }).expect(
        409
      ),
      "MEMBER_NOT_DEPARTED"
    );
    expectApiError(
      await writeOff(alice, household, { ...body, userId: bob.id }).expect(400),
      "INVALID_REFERENCE"
    );
  });

  it("is for admins and owners only", async () => {
    const { carol, dave, household } = await setup();

    expectApiError(
      await writeOff(carol, household, {
        userId: dave.id,
        currency: "PLN",
        method: "forgive",
        amountCents: -300,
      }).expect(403),
      "FORBIDDEN"
    );
  });
});
