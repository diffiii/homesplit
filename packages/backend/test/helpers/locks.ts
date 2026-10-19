import { sql } from "drizzle-orm";
import type { Response, Test } from "supertest";
import { expect, vi } from "vitest";
import { db, type Transaction } from "@/db";

/**
 * Sends a request while a transaction holds the locks `hold` took, and commits
 * once the request waits on them.
 */
export async function sendDuring(
  hold: (tx: Transaction) => Promise<unknown>,
  send: () => Test
): Promise<Response> {
  // Wrapped in an object, so the transaction commits without awaiting it.
  const { request } = await db.transaction(async (tx) => {
    await hold(tx);
    // `then` sends the request.
    const sent = send().then((response) => response);
    await vi.waitFor(
      async () => {
        const { rows } = await db.execute(sql`
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
        `);
        expect(rows).not.toEqual([]);
      },
      { interval: 20, timeout: 3000 }
    );
    return { request: sent };
  });
  return request;
}
