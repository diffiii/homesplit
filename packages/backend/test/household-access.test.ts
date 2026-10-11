import { randomUUID } from "node:crypto";
import { ApiError } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  householdMembershipHistory,
  invitation,
  member,
  organization,
  session,
} from "@/db/schema";
import type { HouseholdRole } from "@/features/households/access/roles";
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
import { HouseholdProbeModule, probePath } from "./helpers/household-probe";

function expectApiError(response: Response, code: string): void {
  expect(ApiError.parse(response.body).code).toBe(code);
}

describe("household access", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(HouseholdProbeModule);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Alice's and Bob's households, plus Carol as a member of Alice's. */
  async function setup(carolRole: HouseholdRole = "member") {
    const { alice, bob } = await createTwoHouseholds(app);
    const carol = await createUser(app, "Carol");
    await inviteAndAccept(alice, alice.household, carol, carolRole);
    return { alice, bob, carol };
  }

  describe("membership", () => {
    it("lets a current member in, with the session user as actor", async () => {
      const { alice } = await createTwoHouseholds(app);

      const response = await alice.client
        .get(probePath(alice.household.id))
        .expect(200);

      expect(response.body).toEqual({
        householdId: alice.household.id,
        role: "owner",
        userId: alice.id,
      });
    });

    it("rejects a malformed householdId", async () => {
      const { alice } = await createTwoHouseholds(app);

      const response = await alice.client
        .get(probePath("not-a-uuid"))
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        { path: ["householdId"], message: expect.any(String) },
      ]);
    });

    it("hides another household and a missing one behind the same 404", async () => {
      const { alice, bob } = await createTwoHouseholds(app);

      const other = await alice.client
        .get(probePath(bob.household.id))
        .expect(404);
      const missing = await alice.client
        .get(probePath(randomUUID()))
        .expect(404);

      expectApiError(other, "NOT_FOUND");
      expect(other.body).toEqual(missing.body);
    });

    it.each([
      [
        "leaves",
        (carol: TestUser, household: TestHousehold) =>
          leaveHousehold(carol, household),
      ],
      [
        "is removed",
        (carol: TestUser, household: TestHousehold, owner: TestUser) =>
          removeMember(owner, household, carol),
      ],
    ] as const)("shuts out a member who %s", async (_, depart) => {
      const { alice, carol } = await setup();

      await depart(carol, alice.household, alice);

      await carol.client.get(probePath(alice.household.id)).expect(404);
    });

    it("ignores the session's active organization", async () => {
      const { alice, bob } = await createTwoHouseholds(app);
      await db
        .update(session)
        .set({ activeOrganizationId: alice.household.id })
        .where(eq(session.userId, bob.id));

      await bob.client.get(probePath(alice.household.id)).expect(404);
      await alice.client.get(probePath(alice.household.id)).expect(200);
    });
  });

  describe("roles", () => {
    it("keeps plain members off admin routes", async () => {
      const { alice, carol } = await setup("member");

      const response = await carol.client
        .get(probePath(alice.household.id, "/admin"))
        .expect(403);

      expectApiError(response, "FORBIDDEN");
    });

    it("lets admins onto admin routes", async () => {
      const { alice, carol } = await setup("admin");

      await carol.client
        .get(probePath(alice.household.id, "/admin"))
        .expect(200);
    });
  });

  it("finds a path resource only under its own household", async () => {
    const { alice, bob } = await createTwoHouseholds(app);
    const [bobsInvitation] = await db
      .insert(invitation)
      .values({
        email: "guest@test.local",
        expiresAt: new Date(Date.now() + 60_000),
        inviterId: bob.id,
        organizationId: bob.household.id,
      })
      .returning();
    const path = `/invitations/${bobsInvitation.id}`;

    await bob.client.get(probePath(bob.household.id, path)).expect(200);
    const response = await alice.client
      .get(probePath(alice.household.id, path))
      .expect(404);

    expectApiError(response, "NOT_FOUND");
  });

  describe("actor and referenced users", () => {
    const item = (userIds: string[], eligibility: "current" | "party") => ({
      name: "Milk",
      userIds,
      eligibility,
    });

    it("ignores forged actor fields", async () => {
      const { alice, bob } = await createTwoHouseholds(app);

      const response = await alice.client
        .post(probePath(alice.household.id, "/items"))
        .send({
          ...item([alice.id], "current"),
          authorId: bob.id,
          createdBy: bob.id,
        })
        .expect(201);

      expect(response.body).toEqual({
        actorId: alice.id,
        body: item([alice.id], "current"),
      });
    });

    it("counts a departed member as a party but not a current member", async () => {
      const { alice, carol } = await setup();
      await leaveHousehold(carol, alice.household);

      const response = await alice.client
        .post(probePath(alice.household.id, "/items"))
        .send(item([alice.id, carol.id], "current"))
        .expect(400);
      await alice.client
        .post(probePath(alice.household.id, "/items"))
        .send(item([alice.id, carol.id], "party"))
        .expect(201);

      expectApiError(response, "INVALID_REFERENCE");
      expect(response.body.details.issues).toEqual([
        { path: ["userIds", 1], message: expect.any(String) },
      ]);
    });

    it("rejects another household's users and unknown IDs alike", async () => {
      const { alice, bob } = await createTwoHouseholds(app);

      const other = await alice.client
        .post(probePath(alice.household.id, "/items"))
        .send(item([bob.id], "party"))
        .expect(400);
      const unknown = await alice.client
        .post(probePath(alice.household.id, "/items"))
        .send(item([randomUUID()], "party"))
        .expect(400);

      expectApiError(other, "INVALID_REFERENCE");
      expect(other.body).toEqual(unknown.body);
    });
  });

  describe("DELETE /api/households/:householdId", () => {
    const householdRow = (id: string) =>
      db.select().from(organization).where(eq(organization.id, id));

    it("is for owners only", async () => {
      const { alice, bob, carol } = await setup("admin");

      await carol.client
        .delete(`/api/households/${alice.household.id}`)
        .expect(403);
      await bob.client
        .delete(`/api/households/${alice.household.id}`)
        .expect(404);
      expect(await householdRow(alice.household.id)).toHaveLength(1);
    });

    it("deletes the household with its members and history", async () => {
      const { alice, bob } = await setup();
      const { id } = alice.household;

      await alice.client.delete(`/api/households/${id}`).expect(204);

      expect(await householdRow(id)).toEqual([]);
      expect(
        await db.select().from(member).where(eq(member.organizationId, id))
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(householdMembershipHistory)
          .where(eq(householdMembershipHistory.organizationId, id))
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(member)
          .where(
            and(
              eq(member.organizationId, bob.household.id),
              eq(member.userId, bob.id)
            )
          )
      ).toHaveLength(1);
    });

    it("blocks Better Auth's own delete endpoint", async () => {
      const { alice } = await createTwoHouseholds(app);

      await alice.client
        .post("/api/auth/organization/delete")
        .send({ organizationId: alice.household.id })
        .expect(404);
      expect(await householdRow(alice.household.id)).toHaveLength(1);
    });
  });
});
