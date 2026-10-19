import { eq } from "drizzle-orm";
import type { Transaction } from "@/db";
import { organization } from "@/db/schema";
import { hasUnsettledBalances } from "@/features/expenses/balances/balances.repository";
import { AppError, notFound } from "@/http/app-error";

/**
 * Locks the household's `organization` row with `lock`, answering 404 when the
 * household is gone, which a write that waited on its deletion finds.
 */
async function lockHousehold(
  tx: Transaction,
  householdId: string,
  lock: "share" | "update"
): Promise<void> {
  const [household] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, householdId))
    .for(lock);
  if (!household) {
    throw notFound();
  }
}

/**
 * Locks the household's `organization` row `FOR SHARE`, as every ledger write
 * does before it writes. A settled-up check locks the same row `FOR UPDATE`, so
 * the two wait for each other, while ledger writes don't block one another. A
 * write that waited on a household's deletion finds no row and answers 404.
 */
export function lockHouseholdForLedgerWrite(
  tx: Transaction,
  householdId: string
): Promise<void> {
  return lockHousehold(tx, householdId, "share");
}

/**
 * Locks the household's `organization` row `FOR UPDATE` and answers 409
 * `HOUSEHOLD_HAS_UNSETTLED_BALANCES` while any balance in it isn't zero.
 * Ledger writes wait for the transaction to end, so the household stays
 * settled up until the change this check guards commits.
 */
export async function assertHouseholdSettledUp(
  tx: Transaction,
  householdId: string
): Promise<void> {
  await lockHousehold(tx, householdId, "update");
  if (await hasUnsettledBalances(tx, householdId)) {
    throw new AppError(
      409,
      "HOUSEHOLD_HAS_UNSETTLED_BALANCES",
      "Every balance in the household must be zero"
    );
  }
}
