import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError, HouseholdFeatures } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { householdFeatures, organization } from "@/db/schema";
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

const TRIGGER_MIGRATION = join(
  process.cwd(),
  "src/db/migrations/0004_household_features_trigger.sql"
);

const featuresPath = (householdId: string) =>
  `/api/households/${householdId}/features`;

function expectApiError(response: Response, code: string): void {
  expect(ApiError.parse(response.body).code).toBe(code);
}

describe("household features", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function setup(carolRole: "member" | "admin" = "member") {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    await inviteAndAccept(alice, alice.household, carol, carolRole);
    return { alice, bob, carol };
  }

  describe("creation and storage", () => {
    it("seeds all modules enabled when a household is created", async () => {
      const alice = await createUser(app, "Alice");
      const household = await createHousehold(alice);

      const [row] = await db
        .select()
        .from(householdFeatures)
        .where(eq(householdFeatures.organizationId, household.id));
      expect(row).toMatchObject({
        expensesEnabled: true,
        choresEnabled: true,
        shoppingEnabled: true,
      });

      const response = await alice.client
        .get(featuresPath(household.id))
        .expect(200);
      expect(HouseholdFeatures.parse(response.body)).toEqual({
        expenses: true,
        chores: true,
        shopping: true,
      });
    });

    it("deletes feature flags when the household is deleted", async () => {
      const { alice } = await setup();
      const { id } = alice.household;

      await alice.client.delete(`/api/households/${id}`).expect(204);

      expect(
        await db
          .select()
          .from(householdFeatures)
          .where(eq(householdFeatures.organizationId, id))
      ).toEqual([]);
    });
  });

  it("backfills organizations that predate the trigger", async () => {
    const orgId = randomUUID();
    await createUser(app, "Alice");

    await db.execute(
      sql`ALTER TABLE organization DISABLE TRIGGER organization_seed_features`
    );
    try {
      await db.insert(organization).values({
        id: orgId,
        name: "Legacy",
        slug: randomUUID(),
        createdAt: new Date(),
      });
      expect(
        await db
          .select()
          .from(householdFeatures)
          .where(eq(householdFeatures.organizationId, orgId))
      ).toEqual([]);

      await db.execute(sql.raw(readFileSync(TRIGGER_MIGRATION, "utf8")));
    } finally {
      await db.execute(
        sql`ALTER TABLE organization ENABLE TRIGGER organization_seed_features`
      );
    }

    const [row] = await db
      .select()
      .from(householdFeatures)
      .where(eq(householdFeatures.organizationId, orgId));
    expect(row).toMatchObject({
      organizationId: orgId,
      expensesEnabled: true,
      choresEnabled: true,
      shoppingEnabled: true,
    });
  });

  describe("PATCH", () => {
    let alice: TestUser;
    let household: TestHousehold;

    beforeEach(async () => {
      alice = await createUser(app, "Alice");
      household = await createHousehold(alice);
    });

    it("applies partial updates and keeps unspecified flags", async () => {
      await alice.client
        .patch(featuresPath(household.id))
        .send({ chores: false })
        .expect(200)
        .expect(({ body }) => {
          expect(HouseholdFeatures.parse(body)).toEqual({
            expenses: true,
            chores: false,
            shopping: true,
          });
        });

      await alice.client
        .patch(featuresPath(household.id))
        .send({ shopping: false })
        .expect(200)
        .expect(({ body }) => {
          expect(HouseholdFeatures.parse(body)).toEqual({
            expenses: true,
            chores: false,
            shopping: false,
          });
        });
    });

    it.each([
      ["empty body", {}],
      ["unknown fields only", { unknown: true }],
    ] as const)("rejects %s with EMPTY_PATCH", async (_, body) => {
      const response = await alice.client
        .patch(featuresPath(household.id))
        .send(body)
        .expect(400);
      expectApiError(response, "EMPTY_PATCH");
    });

    it.each([
      ["null", { chores: null }],
      ["wrong type", { chores: "no" }],
    ] as const)("rejects %s with VALIDATION_ERROR", async (_, body) => {
      const response = await alice.client
        .patch(featuresPath(household.id))
        .send(body)
        .expect(400);
      expectApiError(response, "VALIDATION_ERROR");
    });
  });

  describe("roles and membership", () => {
    it("lets owner and admin patch, member read only", async () => {
      const { alice, carol } = await setup("admin");

      await carol.client
        .patch(featuresPath(alice.household.id))
        .send({ chores: false })
        .expect(200);
      await alice.client
        .patch(featuresPath(alice.household.id))
        .send({ shopping: false })
        .expect(200);

      const member = await createUser(app, "Dave");
      await inviteAndAccept(alice, alice.household, member, "member");

      await member.client.get(featuresPath(alice.household.id)).expect(200);
      const response = await member.client
        .patch(featuresPath(alice.household.id))
        .send({ expenses: false })
        .expect(403);
      expectApiError(response, "FORBIDDEN");
    });

    it("hides features from non-members and unauthenticated callers", async () => {
      const { alice, bob } = await setup();

      await bob.client.get(featuresPath(alice.household.id)).expect(404);
      await createClient(app).get(featuresPath(alice.household.id)).expect(401);
    });

    it.each([
      [
        "removeMember",
        async (alice: TestUser, carol: TestUser, household: TestHousehold) => {
          await removeMember(alice, household, carol);
        },
      ],
      [
        "leaveHousehold",
        async (_alice: TestUser, carol: TestUser, household: TestHousehold) => {
          await leaveHousehold(carol, household);
        },
      ],
    ] as const)("returns 404 after %s", async (_, depart) => {
      const { alice, carol } = await setup();
      await depart(alice, carol, alice.household);

      await carol.client.get(featuresPath(alice.household.id)).expect(404);
      await carol.client
        .patch(featuresPath(alice.household.id))
        .send({ chores: false })
        .expect(404);
    });
  });
});
