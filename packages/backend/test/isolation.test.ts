import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "../src/db";
import { user } from "../src/db/schema";

const insertUser = (email: string) =>
  db.insert(user).values({ email, name: "Isolation" });

describe("test isolation", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("leaves data behind on purpose", async () => {
    await insertUser("leftover@test.local");

    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("starts with empty tables", async () => {
    expect(await db.select().from(user)).toHaveLength(0);

    await insertUser("leftover@test.local");
  });
});
