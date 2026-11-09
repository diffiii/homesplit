import { randomUUID } from "node:crypto";
import {
  ApiError,
  ConfirmedSettlement,
  MAX_AMOUNT_CENTS,
  Settlement,
  SettlementListResponse,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { organization, settlements } from "@/db/schema";
import { SettlementsService } from "@/features/expenses/settlements/settlements.service";
import { createClient, createTestApp } from "./helpers/app";
import {
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

const settlementsPath = (householdId: string) =>
  `/api/households/${householdId}/settlements`;

const settlementPath = (householdId: string, settlementId: string) =>
  `${settlementsPath(householdId)}/${settlementId}`;

const confirmPath = (householdId: string, settlementId: string) =>
  `${settlementPath(householdId, settlementId)}/confirm`;

const payment = (payer: TestUser, payee: TestUser, amountCents = 2500) => ({
  payerId: payer.id,
  payeeId: payee.id,
  amount: { amountCents, currency: "PLN" },
});

function expectApiError(response: Response, code: string): ApiError {
  const error = ApiError.parse(response.body);
  expect(error.code).toBe(code);
  return error;
}

const storedSettlements = (householdId: string) =>
  db.select().from(settlements).where(eq(settlements.householdId, householdId));

describe("settlements", () => {
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

  async function record(
    recorder: TestUser,
    household: TestHousehold,
    body: object
  ): Promise<Settlement> {
    const response = await recorder.client
      .post(settlementsPath(household.id))
      .send(body)
      .expect(201);
    return Settlement.parse(response.body);
  }

  async function history(
    reader: TestUser,
    household: TestHousehold,
    query = ""
  ): Promise<SettlementListResponse> {
    const response = await reader.client
      .get(`${settlementsPath(household.id)}${query}`)
      .expect(200);
    return SettlementListResponse.parse(response.body);
  }

  describe("recording", () => {
    it("stores the payment with the recorder from the session", async () => {
      const { alice, carol, household } = await setup();

      const settlement = await record(carol, household, {
        ...payment(carol, alice, MAX_AMOUNT_CENTS),
        note: "Rent for October",
      });

      expect(settlement).toMatchObject({
        householdId: household.id,
        payer: { id: carol.id, name: "Carol", imageUrl: null },
        payee: { id: alice.id, name: "Alice", imageUrl: null },
        createdBy: { id: carol.id, name: "Carol", imageUrl: null },
        amount: { amountCents: MAX_AMOUNT_CENTS, currency: "PLN" },
        note: "Rent for October",
      });
      const [stored] = await storedSettlements(household.id);
      expect(stored).toMatchObject({
        id: settlement.id,
        createdById: carol.id,
        amountCents: BigInt(MAX_AMOUNT_CENTS),
      });
      expect(stored.createdAt.toISOString()).toBe(settlement.createdAt);
    });

    it("leaves a payment pending only when its payer records it", async () => {
      const { alice, carol, dave, household } = await setup();

      const byPayer = await record(alice, household, payment(alice, carol));
      const byPayee = await record(carol, household, payment(dave, carol));
      const byAdmin = await record(alice, household, payment(dave, carol));

      expect(byPayer).toMatchObject({
        status: "pending",
        confirmedBy: null,
        confirmedAt: null,
      });
      expect(byPayee).toMatchObject({
        status: "confirmed",
        confirmedBy: { id: carol.id },
        confirmedAt: byPayee.createdAt,
      });
      expect(byAdmin).toMatchObject({
        status: "confirmed",
        confirmedBy: { id: alice.id },
      });
    });

    it("keeps a member from recording a payment between others", async () => {
      const { alice, bob, carol, dave, household } = await setup();

      const between = await carol.client
        .post(settlementsPath(household.id))
        .send(payment(dave, alice))
        .expect(403);
      // The right to record is checked before the parties are looked up.
      const outsiders = await carol.client
        .post(settlementsPath(household.id))
        .send(payment(bob, alice))
        .expect(403);

      expectApiError(between, "FORBIDDEN");
      expectApiError(outsiders, "FORBIDDEN");
      expect(await storedSettlements(household.id)).toEqual([]);
    });

    it("answers 401 without a session and 404 to non-members", async () => {
      const { alice, bob, carol, household } = await setup();

      await createClient(app)
        .post(settlementsPath(household.id))
        .send(payment(carol, alice))
        .expect(401);
      await bob.client
        .post(settlementsPath(household.id))
        .send(payment(carol, alice))
        .expect(404);

      expect(await storedSettlements(household.id)).toEqual([]);
    });

    it.each([
      [
        "the same payer and payee",
        (carol: TestUser) => ({ payeeId: carol.id }),
      ],
      [
        "an amount over the limit",
        () => ({
          amount: { amountCents: MAX_AMOUNT_CENTS + 1, currency: "PLN" },
        }),
      ],
      ["a server-set field", () => ({ status: "confirmed" })],
    ])("rejects %s", async (_, override) => {
      const { alice, carol, household } = await setup();

      const response = await carol.client
        .post(settlementsPath(household.id))
        .send({ ...payment(carol, alice), ...override(carol) })
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(await storedSettlements(household.id)).toEqual([]);
    });

    it("needs the expenses module, while history stays readable", async () => {
      const { alice, carol, household } = await setup();
      const pending = await record(carol, household, payment(carol, alice));
      await alice.client
        .patch(`/api/households/${household.id}/features`)
        .send({ expenses: false })
        .expect(200);

      const responses = await Promise.all([
        carol.client
          .post(settlementsPath(household.id))
          .send(payment(carol, alice)),
        alice.client.post(confirmPath(household.id, pending.id)),
        carol.client.delete(settlementPath(household.id, pending.id)),
        alice.client.post(`/api/households/${household.id}/write-offs`).send({
          userId: carol.id,
          currency: "PLN",
          method: "split",
          amountCents: -2500,
        }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        expectApiError(response, "MODULE_DISABLED");
      }
      expect((await history(carol, household)).items).toEqual([pending]);
    });
  });

  describe("parties", () => {
    it("rejects unknown users and users from another household", async () => {
      const { alice, bob, carol, household } = await setup();
      const stranger = await createUser(app, "Erin");

      const response = await alice.client
        .post(settlementsPath(household.id))
        .send(payment(bob, stranger))
        .expect(400);
      const unknown = await carol.client
        .post(settlementsPath(household.id))
        .send({ ...payment(carol, alice), payeeId: randomUUID() })
        .expect(400);

      const issue = (path: string) => ({
        path: [path],
        message: "Unknown or ineligible user",
      });
      expect(expectApiError(response, "INVALID_REFERENCE").details).toEqual({
        issues: [issue("payerId"), issue("payeeId")],
      });
      expect(expectApiError(unknown, "INVALID_REFERENCE").details).toEqual({
        issues: [issue("payeeId")],
      });
      expect(await storedSettlements(household.id)).toEqual([]);
    });

    it("lets others settle with a member after their removal", async () => {
      const { alice, carol, dave, household } = await setup();
      await removeMember(alice, household, carol);

      const received = await record(dave, household, payment(carol, dave));
      const sent = await record(dave, household, payment(dave, carol));
      await carol.client.get(settlementsPath(household.id)).expect(404);
      // An admin+ confirms for the payee who left.
      const confirmed = await alice.client
        .post(confirmPath(household.id, sent.id))
        .expect(200);

      expect(received).toMatchObject({
        status: "confirmed",
        payer: { id: carol.id, name: "Carol" },
      });
      expect(ConfirmedSettlement.parse(confirmed.body)).toMatchObject({
        payee: { id: carol.id, name: "Carol" },
        confirmedBy: { id: alice.id },
      });
    });

    it("filters the history by status, counting only what matches", async () => {
      const { alice, carol, household } = await setup();
      const pending = await record(carol, household, payment(carol, alice));
      const confirmed = await record(alice, household, payment(carol, alice));
      expect(pending.status).toBe("pending");
      expect(confirmed.status).toBe("confirmed");

      const list = async (status: string) =>
        SettlementListResponse.parse(
          (
            await alice.client
              .get(settlementsPath(household.id))
              .query({ status })
              .expect(200)
          ).body
        );

      expect(await list("pending")).toMatchObject({
        items: [{ id: pending.id }],
        totalItems: 1,
      });
      expect(await list("confirmed")).toMatchObject({
        items: [{ id: confirmed.id }],
        totalItems: 1,
      });
      expect((await history(alice, household)).totalItems).toBe(2);
      expectApiError(
        await alice.client
          .get(settlementsPath(household.id))
          .query({ status: "lost" })
          .expect(400),
        "VALIDATION_ERROR"
      );
    });

    it("hides a household's payments from other households", async () => {
      const { alice, bob, carol, household } = await setup();
      const settlement = await record(carol, household, payment(carol, alice));

      await bob.client.get(settlementsPath(household.id)).expect(404);
      await bob.client
        .post(confirmPath(bob.household.id, settlement.id))
        .expect(404);
      await bob.client
        .delete(settlementPath(bob.household.id, settlement.id))
        .expect(404);

      expect((await history(bob, bob.household)).items).toEqual([]);
      expect((await history(alice, household)).items).toEqual([settlement]);
    });
  });

  describe("confirming", () => {
    it("lets the payee confirm, and keeps the first confirmation when repeated", async () => {
      const { alice, carol, household } = await setup();
      const pending = await record(carol, household, payment(carol, alice));

      const first = await alice.client
        .post(confirmPath(household.id, pending.id))
        .expect(200);
      const repeated = await alice.client
        .post(confirmPath(household.id, pending.id))
        .expect(200);

      expect(ConfirmedSettlement.parse(first.body)).toEqual({
        ...pending,
        status: "confirmed",
        confirmedBy: { id: alice.id, name: "Alice", imageUrl: null },
        confirmedAt: first.body.confirmedAt,
      });
      expect(repeated.body).toEqual(first.body);
    });

    it("keeps the payer and uninvolved members from confirming", async () => {
      const { alice, carol, dave, household } = await setup();
      const fromOwner = await record(alice, household, payment(alice, carol));

      const asPayingOwner = await alice.client
        .post(confirmPath(household.id, fromOwner.id))
        .expect(403);
      const asBystander = await dave.client
        .post(confirmPath(household.id, fromOwner.id))
        .expect(403);

      expectApiError(asPayingOwner, "FORBIDDEN");
      expectApiError(asBystander, "FORBIDDEN");
      const [stored] = await storedSettlements(household.id);
      expect(stored.confirmedAt).toBeNull();
    });
  });

  describe("deleting", () => {
    it.each([
      ["its payer withdraw", "carol"],
      ["its payee reject", "dave"],
      ["an admin+ reject", "alice"],
    ] as const)("lets %s a pending payment", async (_, actor) => {
      const users = await setup();
      const { carol, dave, household } = users;
      const pending = await record(carol, household, payment(carol, dave));

      await users[actor].client
        .delete(settlementPath(household.id, pending.id))
        .expect(204);
      const repeated = await users[actor].client
        .delete(settlementPath(household.id, pending.id))
        .expect(404);

      expectApiError(repeated, "NOT_FOUND");
      expect(await storedSettlements(household.id)).toEqual([]);
    });

    it("keeps an uninvolved member from deleting a payment", async () => {
      const { alice, carol, dave, household } = await setup();
      const pending = await record(carol, household, payment(carol, alice));

      const response = await dave.client
        .delete(settlementPath(household.id, pending.id))
        .expect(403);

      expectApiError(response, "FORBIDDEN");
      expect(await storedSettlements(household.id)).toHaveLength(1);
    });

    it("refuses to delete a confirmed payment", async () => {
      const { alice, carol, household } = await setup();
      const confirmed = await record(alice, household, payment(carol, alice));

      const response = await carol.client
        .delete(settlementPath(household.id, confirmed.id))
        .expect(409);

      expectApiError(response, "SETTLEMENT_CONFIRMED");
      expect((await history(alice, household)).items).toEqual([confirmed]);
    });
  });

  describe("history", () => {
    it("lists the newest payment first", async () => {
      const { alice, carol, dave, household } = await setup();
      const first = await record(carol, household, payment(carol, alice, 100));
      const second = await record(alice, household, payment(dave, alice, 200));

      expect(await history(dave, household)).toEqual({
        items: [second, first],
        page: 1,
        pageSize: 20,
        totalItems: 2,
      });
    });

    it("pages through payments with equal timestamps without gaps or repeats", async () => {
      const { alice, carol, household } = await setup();
      const row = (suffix: number, createdAt: string) => ({
        id: `00000000-0000-4000-8000-00000000000${suffix}`,
        householdId: household.id,
        payerId: carol.id,
        payeeId: alice.id,
        createdById: carol.id,
        amountCents: 100n,
        currency: "PLN",
        createdAt: new Date(createdAt),
      });
      const sameInstant = "2026-10-01T12:00:00Z";
      await db
        .insert(settlements)
        .values([
          row(3, sameInstant),
          row(7, "2026-09-30T12:00:00Z"),
          row(1, sameInstant),
          row(5, sameInstant),
          row(2, "2026-10-02T12:00:00Z"),
          row(4, sameInstant),
          row(6, sameInstant),
        ]);
      const expected = [2, 6, 5, 4, 3, 1, 7].map(
        (suffix) => row(suffix, "").id
      );

      const pages = [
        await history(alice, household, "?page=1&pageSize=3"),
        await history(alice, household, "?page=2&pageSize=3"),
        await history(alice, household, "?page=3&pageSize=3"),
      ];
      const pastTheEnd = await history(alice, household, "?page=4&pageSize=3");

      expect(
        pages.flatMap((page) => page.items.map((item) => item.id))
      ).toEqual(expected);
      expect(pages.map((page) => page.totalItems)).toEqual([7, 7, 7]);
      expect(pastTheEnd).toEqual({
        items: [],
        page: 4,
        pageSize: 3,
        totalItems: 7,
      });
    });
  });

  describe("repeated and failed requests", () => {
    it("records identical payments as separate entries", async () => {
      const { alice, carol, household } = await setup();
      const body = { ...payment(carol, alice), note: "Lunch" };

      const first = await record(carol, household, body);
      const second = await record(carol, household, body);

      expect(second.id).not.toBe(first.id);
      expect(await history(alice, household)).toMatchObject({
        items: [second, first],
        totalItems: 2,
      });
    });

    it("stores nothing when recording fails after the insert", async () => {
      const { alice, carol, household } = await setup();
      const find = vi
        .spyOn(app.get(SettlementsService), "find")
        .mockRejectedValueOnce(new Error("read failed"));

      try {
        const response = await carol.client
          .post(settlementsPath(household.id))
          .send(payment(carol, alice))
          .expect(500);
        expectApiError(response, "INTERNAL_ERROR");
        expect(find).toHaveBeenCalledOnce();
      } finally {
        find.mockRestore();
      }

      expect(await storedSettlements(household.id)).toEqual([]);
    });

    it("waits for a household deletion in progress, then answers 404", async () => {
      const { alice, carol, household } = await setup();

      const response = await sendDuring(
        (tx) =>
          tx.delete(organization).where(eq(organization.id, household.id)),
        () =>
          carol.client
            .post(settlementsPath(household.id))
            .send(payment(carol, alice))
      );

      expect(response.status).toBe(404);
      expect(await db.select().from(settlements)).toEqual([]);
    });

    it("refuses a deletion that waited for a confirmation", async () => {
      const { alice, carol, household } = await setup();
      const pending = await record(carol, household, payment(carol, alice));

      const response = await sendDuring(
        (tx) =>
          tx
            .update(settlements)
            .set({ confirmedById: alice.id, confirmedAt: new Date() })
            .where(eq(settlements.id, pending.id)),
        () => carol.client.delete(settlementPath(household.id, pending.id))
      );

      expect(response.status).toBe(409);
      expect(await storedSettlements(household.id)).toHaveLength(1);
    });
  });

  describe("storage", () => {
    it.each([
      ["a zero amount", () => ({ amountCents: 0n }), "23514"],
      [
        "a payment to oneself",
        (alice: TestUser) => ({ payerId: alice.id }),
        "23514",
      ],
      [
        "a confirmation time without a confirmer",
        () => ({ confirmedAt: new Date() }),
        "23514",
      ],
      [
        "a party who was never in the household",
        (_alice: TestUser, bob: TestUser) => ({ payerId: bob.id }),
        "23503",
      ],
    ])("rejects %s", async (_, override, code) => {
      const { alice, bob, carol, household } = await setup();

      await expect(
        db.insert(settlements).values({
          householdId: household.id,
          payerId: carol.id,
          payeeId: alice.id,
          createdById: carol.id,
          amountCents: 100n,
          currency: "PLN",
          ...override(alice, bob),
        })
      ).rejects.toMatchObject({ cause: { code } });
    });

    it("deletes a household's payments with the household", async () => {
      const { alice, carol, household } = await setup();
      await record(carol, household, payment(carol, alice));

      await alice.client.delete(`/api/households/${household.id}`).expect(204);

      expect(await db.select().from(settlements)).toEqual([]);
    });
  });
});
