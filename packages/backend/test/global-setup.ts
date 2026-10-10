import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";

export default async function setup(project: TestProject): Promise<void> {
  const pool = new Pool({
    connectionString: project.config.env.DATABASE_URL,
  });

  try {
    await migrate(drizzle(pool), { migrationsFolder: "src/db/migrations" });
  } finally {
    await pool.end();
  }
}
