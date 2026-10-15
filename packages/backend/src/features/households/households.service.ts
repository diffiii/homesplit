import type {
  HouseholdFeatures,
  UpdateHouseholdFeaturesRequest,
} from "@homesplit/contracts";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { householdFeatures, organization } from "@/db/schema";
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

  async updateFeatures(
    householdId: string,
    patch: UpdateHouseholdFeaturesRequest
  ): Promise<HouseholdFeatures> {
    const set = patchToFeatureSet(patch);
    const [row] = await db
      .update(householdFeatures)
      .set(set)
      .where(eq(householdFeatures.organizationId, householdId))
      .returning();
    if (!row) {
      throw notFound();
    }
    // TODO: #40 reject turning off expenses while balances are non-zero

    return rowToHouseholdFeatures(row);
  }

  async deleteHousehold(householdId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, householdId))
        .for("update");
      if (!locked) {
        throw notFound();
      }

      // TODO: later we should check balances before deleting the household

      await tx.delete(organization).where(eq(organization.id, householdId));
    });
  }
}
