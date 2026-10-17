import { ApiError, Chore, ChoreListResponse } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { chores } from "@/db/schema";
import { createClient, createTestApp } from "./helpers/app";
import {
  createHousehold,
  createTwoHouseholds,
  createUser,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const choresPath = (householdId: string) =>
  `/api/households/${householdId}/chores`;

function expectApiError(response: Response, code: string): void {
  expect(ApiError.parse(response.body).code).toBe(code);
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
          completedAt: new Date().toISOString(), // <-- ZMIANA Z new Date() NA .toISOString()
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
