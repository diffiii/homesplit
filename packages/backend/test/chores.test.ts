import { randomUUID } from "node:crypto";
import {
  Chore,
  ChoreListResponse,
  CompletedChore,
  OpenChore,
} from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { chores } from "@/db/schema";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  inviteAndAccept,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";
import { sendDuring } from "./helpers/locks";

const choresPath = (householdId: string) =>
  `/api/households/${householdId}/chores`;

const transitionPath = (
  householdId: string,
  choreId: string,
  action: "complete" | "reopen"
) => `${choresPath(householdId)}/${choreId}/${action}`;

async function expectViolation(
  write: Promise<unknown>,
  constraint: string
): Promise<void> {
  await expect(write).rejects.toMatchObject({ cause: { constraint } });
}

describe("chores API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("CRUD and acceptance criteria", () => {
    let alice: TestUser;
    let household: TestHousehold;

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      household = await createHousehold(alice);
    });

    it("rejects date-only dueAt values with VALIDATION_ERROR", async () => {
      const response = await alice.client
        .post(choresPath(household.id))
        .send({
          name: "Clean kitchen",
          dueAt: "2026-10-06", // Date-only string, should be rejected
        })
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });

    it("supports dueAt ISO datetime round trips", async () => {
      const dueAt = "2026-10-06T16:00:00.000Z";

      const createRes = await alice.client
        .post(choresPath(household.id))
        .send({
          name: "Vacuum living room",
          dueAt,
        })
        .expect(201);

      const createdChore = Chore.parse(createRes.body);
      expect(createdChore.dueAt).toBe(dueAt);

      const getRes = await alice.client
        .get(`${choresPath(household.id)}/${createdChore.id}`)
        .expect(200);

      const fetchedChore = Chore.parse(getRes.body);
      expect(fetchedChore.dueAt).toBe(dueAt);
    });

    it("handles nullable patches for dueAt correctly (omitting keeps deadline, null clears it)", async () => {
      const initialDueAt = "2026-10-06T16:00:00.000Z";

      const createRes = await alice.client
        .post(choresPath(household.id))
        .send({
          name: "Take out trash",
          dueAt: initialDueAt,
        })
        .expect(201);

      const chore = Chore.parse(createRes.body);

      // 1. Omitting dueAt on update keeps the existing deadline
      const patchRes1 = await alice.client
        .patch(`${choresPath(household.id)}/${chore.id}`)
        .send({ name: "Take out trash and recycling" })
        .expect(200);

      const updatedChore1 = Chore.parse(patchRes1.body);
      expect(updatedChore1.name).toBe("Take out trash and recycling");
      expect(updatedChore1.dueAt).toBe(initialDueAt);

      // 2. Explicit null clears the deadline
      const patchRes2 = await alice.client
        .patch(`${choresPath(household.id)}/${chore.id}`)
        .send({ dueAt: null })
        .expect(200);

      const updatedChore2 = Chore.parse(patchRes2.body);
      expect(updatedChore2.dueAt).toBeNull();
    });

    it("rejects assignees from other households with 400 INVALID_REFERENCE", async () => {
      const { bob } = await createTwoHouseholds(app);

      const response = await alice.client
        .post(choresPath(household.id))
        .send({
          name: "Water plants",
          assignedToId: bob.id, // Bob is in a different household
        })
        .expect(400);

      expectApiError(response, "INVALID_REFERENCE");
    });

    it("hides completed chores by default and decodes includeCompleted query parameter", async () => {
      // 1. Create an open chore
      const createOpenRes = await alice.client
        .post(choresPath(household.id))
        .send({ name: "Mop floors" })
        .expect(201);

      const openChore = Chore.parse(createOpenRes.body);

      // 2. Create a completed chore directly
      const createCompletedRes = await alice.client
        .post(choresPath(household.id))
        .send({ name: "Clean windows" })
        .expect(201);

      const completedChore = Chore.parse(createCompletedRes.body);

      // Mark the second chore as completed in DB
      await db
        .update(chores)
        .set({
          isCompleted: true,
          completedAt: new Date().toISOString(),
          completedById: alice.id,
        })
        .where(eq(chores.id, completedChore.id));

      // 3. Default list shows only open chores
      const listDefaultRes = await alice.client
        .get(choresPath(household.id))
        .expect(200);

      const defaultList = ChoreListResponse.parse(listDefaultRes.body);
      expect(defaultList.items).toHaveLength(1);
      expect(defaultList.items[0].id).toBe(openChore.id);

      // 4. Query parameter with includeCompleted=true includes completed chores as well
      const listAllRes = await alice.client
        .get(`${choresPath(household.id)}?includeCompleted=true`)
        .expect(200);

      const allList = ChoreListResponse.parse(listAllRes.body);
      expect(allList.items).toHaveLength(2);
    });
  });

  describe("complete and reopen", () => {
    let alice: TestUser;
    let bob: TestUser;
    let household: TestHousehold;
    let chore: OpenChore;

    const complete = (user: TestUser, choreId = chore.id) =>
      user.client.post(transitionPath(household.id, choreId, "complete"));
    const reopen = (user: TestUser, choreId = chore.id) =>
      user.client.post(transitionPath(household.id, choreId, "reopen"));
    const stored = async () =>
      Chore.parse(
        (
          await alice.client
            .get(`${choresPath(household.id)}/${chore.id}`)
            .expect(200)
        ).body
      );

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      bob = await createUser(app, "Bob");
      household = await createHousehold(alice);
      await inviteAndAccept(alice, household, bob);
      const response = await alice.client
        .post(choresPath(household.id))
        .send({ name: "Clean bathroom" })
        .expect(201);
      chore = OpenChore.parse(response.body);
    });

    it("creates chores open, completes them as the caller, and reopens them", async () => {
      expect(chore).toMatchObject({
        isCompleted: false,
        completedAt: null,
        completedBy: null,
      });

      const before = Date.now();
      const completed = CompletedChore.parse(
        (await complete(bob).expect(200)).body
      );
      expect(completed.completedBy).toEqual({
        id: bob.id,
        name: bob.name,
        imageUrl: null,
      });
      expect(Date.parse(completed.completedAt)).toBeGreaterThanOrEqual(
        before - 1000
      );
      expect(await stored()).toEqual(completed);

      const reopened = OpenChore.parse((await reopen(alice).expect(200)).body);
      expect(reopened).toEqual({
        ...chore,
        updatedAt: reopened.updatedAt,
      });
      expect(await stored()).toEqual(reopened);
    });

    it("answers a repeated complete or reopen with the chore unchanged", async () => {
      const completed = CompletedChore.parse(
        (await complete(bob).expect(200)).body
      );

      const again = await complete(alice).expect(200);
      expect(CompletedChore.parse(again.body)).toEqual(completed);

      const reopened = OpenChore.parse((await reopen(alice).expect(200)).body);
      const reopenedAgain = await reopen(bob).expect(200);
      expect(OpenChore.parse(reopenedAgain.body)).toEqual(reopened);
    });

    it("hides chores from non-members, unauthenticated callers, and other households", async () => {
      const { bob: stranger } = await createTwoHouseholds(app);
      const anonymous = createClient(app);

      await Promise.all(
        (["complete", "reopen"] as const).flatMap((action) => [
          stranger.client
            .post(transitionPath(household.id, chore.id, action))
            .expect(404),
          anonymous
            .post(transitionPath(household.id, chore.id, action))
            .expect(401),
          stranger.client
            .post(transitionPath(stranger.household.id, chore.id, action))
            .expect(404),
          alice.client
            .post(transitionPath(household.id, randomUUID(), action))
            .expect(404),
        ])
      );
      expect(await stored()).toEqual(chore);
    });

    it("needs the chores module", async () => {
      await alice.client
        .patch(`/api/households/${household.id}/features`)
        .send({ chores: false })
        .expect(200);

      const responses = await Promise.all([complete(bob), reopen(bob)]);
      for (const response of responses) {
        expect(response.status).toBe(403);
        expectApiError(response, "MODULE_DISABLED");
      }
      expect(await stored()).toEqual(chore);
    });

    it("completes a chore once when both members complete it at the same time", async () => {
      const responses = await Promise.all([complete(alice), complete(bob)]);

      const [first, second] = responses.map((response) =>
        CompletedChore.parse(response.body)
      );
      expect(second).toEqual(first);
      expect(await stored()).toEqual(first);
    });

    it("keeps the completer a waiting complete finds", async () => {
      const response = await sendDuring(
        (tx) =>
          tx
            .update(chores)
            .set({
              isCompleted: true,
              completedAt: sql`now()`,
              completedById: bob.id,
            })
            .where(eq(chores.id, chore.id)),
        () => complete(alice)
      );

      expect(response.status).toBe(200);
      expect(CompletedChore.parse(response.body).completedBy.id).toBe(bob.id);
    });

    it("reopens a chore completed while the reopen waited", async () => {
      const response = await sendDuring(
        (tx) =>
          tx
            .update(chores)
            .set({
              isCompleted: true,
              completedAt: sql`now()`,
              completedById: bob.id,
            })
            .where(eq(chores.id, chore.id)),
        () => reopen(alice)
      );

      expect(response.status).toBe(200);
      expect(OpenChore.parse(response.body)).toMatchObject({
        completedAt: null,
        completedBy: null,
      });
      expect((await stored()).isCompleted).toBe(false);
    });

    it("rolls back a transition that fails", async () => {
      await db.execute(
        sql.raw(`
          CREATE FUNCTION "reject_chore_update"() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'update failed';
          END;
          $$;
          CREATE TRIGGER "reject_chore_update"
          AFTER UPDATE ON "chores"
          FOR EACH ROW WHEN (NEW.id = '${chore.id}')
          EXECUTE FUNCTION "reject_chore_update"();
        `)
      );
      let response: Response;
      try {
        response = await complete(bob);
      } finally {
        await db.execute(
          sql.raw(`
            DROP TRIGGER "reject_chore_update" ON "chores";
            DROP FUNCTION "reject_chore_update"();
          `)
        );
      }

      expectApiError(response, "INTERNAL_ERROR");
      expect(await stored()).toEqual(chore);
    });

    it("rejects completion metadata that doesn't match the state", async () => {
      const set = (values: Partial<typeof chores.$inferInsert>) =>
        db.update(chores).set(values).where(eq(chores.id, chore.id));
      const completedAt = new Date().toISOString();

      await expectViolation(set({ isCompleted: true }), "chores_completion");
      await expectViolation(
        set({ isCompleted: true, completedAt }),
        "chores_completion"
      );
      await expectViolation(
        set({ isCompleted: true, completedById: bob.id }),
        "chores_completion"
      );
      await expectViolation(set({ completedAt }), "chores_completion");
      await expectViolation(
        set({ completedById: bob.id }),
        "chores_completion"
      );
      expect(await stored()).toEqual(chore);
    });
  });

  describe("assignee filter", () => {
    let alice: TestUser;
    let bob: TestUser;
    let carol: TestUser;
    let household: TestHousehold;

    const create = async (
      body: { name: string; assignedToId?: string; dueAt?: string },
      as = alice
    ) =>
      Chore.parse(
        (await as.client.post(choresPath(household.id)).send(body).expect(201))
          .body
      );

    const list = async (query: string) =>
      ChoreListResponse.parse(
        (
          await alice.client
            .get(`${choresPath(household.id)}${query}`)
            .expect(200)
        ).body
      );

    const ids = (response: ChoreListResponse) =>
      response.items.map((item) => item.id);

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      bob = await createUser(app, "Bob");
      carol = await createUser(app, "Carol");
      household = await createHousehold(alice);
      await inviteAndAccept(alice, household, bob);
      await inviteAndAccept(alice, household, carol);
    });

    it("lists only the assignee's chores, open by default or with completed ones", async () => {
      const later = await create({
        name: "Mop floors",
        assignedToId: bob.id,
        dueAt: "2026-10-05T12:00:00.000Z",
      });
      const sooner = await create({
        name: "Take out trash",
        assignedToId: bob.id,
        dueAt: "2026-10-01T12:00:00.000Z",
      });
      const done = await create({ name: "Dust shelves", assignedToId: bob.id });
      await bob.client
        .post(transitionPath(household.id, done.id, "complete"))
        .expect(200);
      await create({ name: "Water plants", assignedToId: alice.id });
      await create({ name: "Clean windows" });

      const open = await list(`?assignedToId=${bob.id}`);
      const all = await list(`?assignedToId=${bob.id}&includeCompleted=true`);

      expect(open).toMatchObject({ totalItems: 2 });
      expect(ids(open)).toEqual([sooner.id, later.id]);
      expect(all).toMatchObject({ totalItems: 3 });
      expect(ids(all)).toEqual([sooner.id, later.id, done.id]);
    });

    it("keeps the order and pagination", async () => {
      const due = (day: string) =>
        create({
          name: `Chore due ${day}`,
          assignedToId: bob.id,
          dueAt: `2026-10-${day}T12:00:00.000Z`,
        });
      const first = await due("03");
      const second = await due("07");
      const undated = await create({ name: "Someday", assignedToId: bob.id });
      await create({
        name: "Not Bob's",
        assignedToId: carol.id,
        dueAt: "2026-10-05T12:00:00.000Z",
      });

      const page1 = await list(`?assignedToId=${bob.id}&pageSize=2`);
      const page2 = await list(`?assignedToId=${bob.id}&pageSize=2&page=2`);

      expect(page1).toMatchObject({ page: 1, pageSize: 2, totalItems: 3 });
      expect(ids(page1)).toEqual([first.id, second.id]);
      expect(page2).toMatchObject({ page: 2, pageSize: 2, totalItems: 3 });
      expect(ids(page2)).toEqual([undated.id]);
    });

    it("finds a departed member's open chores so they can be reassigned", async () => {
      const chore = await create({
        name: "Fix the wardrobe door",
        assignedToId: carol.id,
      });
      await removeMember(alice, household, carol);

      const before = await list(`?assignedToId=${carol.id}`);
      expect(ids(before)).toEqual([chore.id]);

      await alice.client
        .patch(`${choresPath(household.id)}/${chore.id}`)
        .send({ assignedToId: bob.id })
        .expect(200);

      expect(await list(`?assignedToId=${carol.id}`)).toMatchObject({
        items: [],
        totalItems: 0,
      });
      expect(ids(await list(`?assignedToId=${bob.id}`))).toEqual([chore.id]);
    });

    it("matches nothing for another household's or unknown user IDs", async () => {
      await create({ name: "Mop floors", assignedToId: bob.id });
      const dave = await createUser(app, "Dave");
      const theirs = await createHousehold(dave);
      await dave.client
        .post(choresPath(theirs.id))
        .send({ name: "Their chore", assignedToId: dave.id })
        .expect(201);

      const queries = [
        `?assignedToId=${dave.id}`,
        `?assignedToId=${dave.id}&includeCompleted=true`,
        `?assignedToId=${randomUUID()}`,
      ];

      const responses = await Promise.all(queries.map(list));

      for (const response of responses) {
        expect(response).toEqual({
          items: [],
          page: 1,
          pageSize: 20,
          totalItems: 0,
        });
      }
    });

    it("rejects a malformed assignedToId with VALIDATION_ERROR", async () => {
      const response = await alice.client
        .get(`${choresPath(household.id)}?assignedToId=bob`)
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });
  });

  describe("authorization and feature flags", () => {
    it("hides chores from non-members and unauthenticated callers", async () => {
      const { alice, bob } = await createTwoHouseholds(app);

      await bob.client.get(choresPath(alice.household.id)).expect(404);
      await createClient(app).get(choresPath(alice.household.id)).expect(401);
    });

    it("returns 403 MODULE_DISABLED on writes when chores_enabled flag is false", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);

      // Disable chores module for this household
      await alice.client
        .patch(`/api/households/${household.id}/features`)
        .send({ chores: false })
        .expect(200);

      // GET routes still work when module is disabled
      await alice.client.get(choresPath(household.id)).expect(200);

      // POST returns 403 MODULE_DISABLED
      const response = await alice.client
        .post(choresPath(household.id))
        .send({ name: "Clean windows" })
        .expect(403);

      expectApiError(response, "MODULE_DISABLED");
    });
  });
});
