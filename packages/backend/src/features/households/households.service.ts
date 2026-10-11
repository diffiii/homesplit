import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { organization } from "../../db/schema";
import { notFound } from "../../http/app-error";

@Injectable()
export class HouseholdsService {
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
