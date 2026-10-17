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

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `db` itself or an open transaction. */
export type Executor = typeof db | Transaction;

/**
 * Runs `read` in one read-only `REPEATABLE READ` transaction, so every query
 * in it sees the same snapshot, such as a page of a list and its total.
 */
export function readSnapshot<T>(
  read: (tx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(read, {
    accessMode: "read only",
    isolationLevel: "repeatable read",
  });
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
