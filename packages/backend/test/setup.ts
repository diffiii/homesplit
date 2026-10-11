import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";
import { db } from "@/db";

beforeEach(async () => {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );

  if (rows.length === 0) {
    return;
  }

  const tables = rows.map(({ tablename }) => `"public"."${tablename}"`);
  await db.execute(
    sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`)
  );
});
