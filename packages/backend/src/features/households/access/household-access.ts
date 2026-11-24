import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/db";
import { householdMembershipHistory, member } from "@/db/schema";
import { invalidReference } from "@/http/app-error";

/** A user ID from the request and where it appeared, for `details.issues`. */
export interface UserReference {
  path: (string | number)[];
  userId: string;
}

/**
 * `current`: has a `member` row now. `party`: has ever been a member, so
 * departed members count too.
 */
export type Eligibility = "current" | "party";

/**
 * Rejects references to users who aren't eligible in this household. Unknown
 * users and users from other households get the same 400.
 */
export async function assertUsersEligible(
  executor: Executor,
  householdId: string,
  refs: readonly UserReference[],
  eligibility: Eligibility
): Promise<void> {
  if (refs.length === 0) {
    return;
  }

  const table = eligibility === "current" ? member : householdMembershipHistory;
  const userIds = [...new Set(refs.map((ref) => ref.userId))];
  const rows = await executor
    .select({ userId: table.userId })
    .from(table)
    .where(
      and(eq(table.organizationId, householdId), inArray(table.userId, userIds))
    );

  const eligible = new Set(rows.map((row) => row.userId));
  const issues = refs
    .filter((ref) => !eligible.has(ref.userId))
    .map(({ path }) => ({ path, message: "Unknown or ineligible user" }));
  if (issues.length > 0) {
    throw invalidReference(issues);
  }
}
