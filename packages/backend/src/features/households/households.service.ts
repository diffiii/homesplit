import type {
  HouseholdFeatures,
  UpdateHouseholdFeaturesRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { householdFeatures, organization } from "@/db/schema";
import { assertHouseholdSettledUp } from "@/features/expenses/household-ledger-lock";
import { notFound } from "@/http/app-error";
import {
  patchToFeatureSet,
  rowToHouseholdFeatures,
} from "./household-features";

@Injectable()
export class HouseholdsService {
  async getFeatures(householdId: string): Promise<HouseholdFeatures> {
    const [row] = await db
      .select()
      .from(householdFeatures)
      .where(eq(householdFeatures.organizationId, householdId))
      .limit(1);
    if (!row) {
      throw new Error(
        `Missing household_features row for organization ${householdId}`
      );
    }
    return rowToHouseholdFeatures(row);
  }

  updateFeatures(
    householdId: string,
    patch: UpdateHouseholdFeaturesRequest
  ): Promise<HouseholdFeatures> {
    const set = patchToFeatureSet(patch);
    return db.transaction(async (tx) => {
      // Members can always settle up, so `expenses` stays on until they have.
      if (patch.expenses === false) {
        await assertHouseholdSettledUp(tx, householdId);
      }
      const [row] = await tx
        .update(householdFeatures)
        .set(set)
        .where(eq(householdFeatures.organizationId, householdId))
        .returning();
      if (!row) {
        throw notFound();
      }
      return rowToHouseholdFeatures(row);
    });
  }

  async deleteHousehold(householdId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await assertHouseholdSettledUp(tx, householdId);
      await tx.delete(organization).where(eq(organization.id, householdId));
    });
  }
}
