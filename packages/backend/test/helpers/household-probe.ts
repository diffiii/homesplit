import { type Endpoint, Id } from "@homesplit/contracts";
import { Body, Controller, Module, Param } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AppModule } from "@/app.module";
import { db } from "@/db";
import { invitation } from "@/db/schema";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { assertUsersEligible } from "@/features/households/access/household-access";
import { notFound } from "@/http/app-error";
import { ZodPipe } from "@/http/zod.pipe";

export const probePath = (householdId: string, path = ""): string =>
  `/api/households/${householdId}/probe${path}`;

const probe = (
  method: Endpoint["method"],
  path: string,
  status: 200 | 201 = 200
): Endpoint => ({
  method,
  path: `/api/households/:householdId/probe${path}`,
  status,
  response: z.unknown(),
});

/** No author or creator field: the actor comes only from the session. */
const ProbeItem = z.object({
  name: z.string().min(1),
  userIds: z.array(Id),
  eligibility: z.enum(["current", "party"]),
});
type ProbeItem = z.output<typeof ProbeItem>;

/** Test-only household routes that exercise the guard and access helpers. */
@Controller()
class HouseholdProbeController {
  @HouseholdRoute(probe("GET", ""))
  context(@CurrentHousehold() household: HouseholdContext) {
    return household;
  }

  @HouseholdRoute(probe("GET", "/admin"), { minRole: "admin" })
  admin(@CurrentHousehold() household: HouseholdContext) {
    return household;
  }

  /** A path resource looked up by its ID and the household together. */
  @HouseholdRoute(probe("GET", "/invitations/:invitationId"))
  async invitation(
    @CurrentHousehold() { householdId }: HouseholdContext,
    @Param("invitationId", new ZodPipe(Id)) invitationId: Id
  ) {
    const [row] = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, householdId)
        )
      );
    if (!row) {
      throw notFound();
    }
    return row;
  }

  @HouseholdRoute(probe("POST", "/items", 201))
  async createItem(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(ProbeItem)) body: ProbeItem
  ) {
    const refs = body.userIds.map((userId, index) => ({
      userId,
      path: ["userIds", index],
    }));
    await assertUsersEligible(
      db,
      household.householdId,
      refs,
      body.eligibility
    );
    return { actorId: household.userId, body };
  }
}

@Module({
  imports: [AppModule],
  controllers: [HouseholdProbeController],
})
export class HouseholdProbeModule {}
