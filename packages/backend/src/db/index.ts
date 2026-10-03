import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
// biome-ignore lint/performance/noNamespaceImport: drizzle schema bag
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}
