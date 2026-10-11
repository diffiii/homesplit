import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  householdMembershipHistory,
  member,
  organization,
  user,
} from "@/db/schema";
import { createTestApp } from "./helpers/app";
import {
  createHousehold,
  createUser,
  inviteAndAccept,
  leaveHousehold,
  removeMember,
  type TestHousehold,
  type TestUser,
} from "./helpers/fixtures";

const TRIGGER_MIGRATION = join(
  process.cwd(),
  "src/db/migrations/0002_membership_history_trigger.sql"
);

function historyOf(householdId: string) {
  return db
    .select({
      userId: householdMembershipHistory.userId,
      firstJoinedAt: householdMembershipHistory.firstJoinedAt,
    })
    .from(householdMembershipHistory)
    .where(eq(householdMembershipHistory.organizationId, householdId))
    .orderBy(householdMembershipHistory.firstJoinedAt);
}

function rolesOf(householdId: string, userId: string) {
  return db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, householdId), eq(member.userId, userId))
    );
}

describe("membership history", () => {
  let app: INestApplication;
  let alice: TestUser;
  let carol: TestUser;
  let household: TestHousehold;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    alice = await createUser(app, "Alice");
    carol = await createUser(app, "Carol");
    household = await createHousehold(alice);
  });

  it("records the owner and every accepted invitation", async () => {
    await inviteAndAccept(alice, household, carol);

    const history = await historyOf(household.id);
    expect(history.map((row) => row.userId)).toEqual([alice.id, carol.id]);
  });

  it("survives leaving", async () => {
    await inviteAndAccept(alice, household, carol);

    await leaveHousehold(carol, household);

    expect(await rolesOf(household.id, carol.id)).toEqual([]);
    expect((await historyOf(household.id)).map((row) => row.userId)).toContain(
      carol.id
    );
  });

  it("survives removal and keeps the first join time on rejoining", async () => {
    await inviteAndAccept(alice, household, carol);
    const before = await historyOf(household.id);

    await removeMember(alice, household, carol);
    expect(await historyOf(household.id)).toEqual(before);

    await inviteAndAccept(alice, household, carol, "admin");
    expect(await rolesOf(household.id, carol.id)).toEqual([{ role: "admin" }]);
    expect(await historyOf(household.id)).toEqual(before);
  });

  it("keeps a user with history from being hard-deleted", async () => {
    await expect(
      db.delete(user).where(eq(user.id, alice.id))
    ).rejects.toMatchObject({ cause: { code: "23001" } });
  });

  it("is backfilled for members that predate the trigger", async () => {
    const orgId = randomUUID();
    const createdAt = new Date("2026-01-02T03:04:05Z");

    await db.execute(
      sql`ALTER TABLE member DISABLE TRIGGER member_record_history`
    );
    try {
      await db
        .insert(organization)
        .values({ id: orgId, name: "Legacy", slug: randomUUID(), createdAt });
      await db.insert(member).values([
        { organizationId: orgId, userId: alice.id, role: "owner", createdAt },
        { organizationId: orgId, userId: carol.id, role: "member", createdAt },
      ]);
      expect(await historyOf(orgId)).toEqual([]);

      await db.execute(sql.raw(readFileSync(TRIGGER_MIGRATION, "utf8")));
    } finally {
      await db.execute(
        sql`ALTER TABLE member ENABLE TRIGGER member_record_history`
      );
    }

    const userIds = (await historyOf(orgId)).map((row) => row.userId);
    expect(userIds.sort()).toEqual([alice.id, carol.id].sort());
  });
});
