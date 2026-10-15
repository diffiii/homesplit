import { eq } from "drizzle-orm";
import type { Transaction } from "@/db";
import { organization } from "@/db/schema";
import { notFound } from "@/http/app-error";

/**
 * Locks the household's `organization` row `FOR SHARE`, as every ledger write
 * does before it writes. A settled-up check locks the same row `FOR UPDATE`, so
 * the two wait for each other, while ledger writes don't block one another. A
 * write that waited on a household's deletion finds no row and answers 404.
 */
export async function lockHouseholdForLedgerWrite(
  tx: Transaction,
  householdId: string
): Promise<void> {
  const [household] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, householdId))
    .for("share");
  if (!household) {
    throw notFound();
  }
}
