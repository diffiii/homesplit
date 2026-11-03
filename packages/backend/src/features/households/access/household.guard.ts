import { type FeatureId, HouseholdIdParams } from "@homesplit/contracts";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { householdFeatures, member } from "@/db/schema";
import { isModuleEnabled } from "@/features/households/household-features";
import { forbidden, moduleDisabled, notFound } from "@/http/app-error";
import { ZodPipe } from "@/http/zod.pipe";
import { type HouseholdRole, hasRole, strongestRole } from "./roles";

export const MIN_ROLE = Symbol("household:minRole");
export const REQUIRED_MODULE = Symbol("household:requiredModule");

/** The caller's current membership in the household named by the URL. */
export interface HouseholdContext {
  readonly householdId: string;
  readonly role: HouseholdRole | null;
  /** The acting user. Always from the session, never from the request. */
  readonly userId: string;
}

/** Runs after the global `AuthGuard`, so the session is always set. */
export interface HouseholdRequest {
  household?: HouseholdContext;
  params: unknown;
  session: UserSession;
}

const paramsPipe = new ZodPipe(HouseholdIdParams);

/**
 * Admits only current members of `:householdId`, with at least the route's
 * `minRole`. `session.activeOrganizationId` is never consulted.
 */
@Injectable()
export class HouseholdGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Inject(Reflector) reflector: Reflector) {
    this.reflector = reflector;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HouseholdRequest>();
    const userId = request.session.user.id;
    const { householdId } = paramsPipe.transform(request.params, {
      type: "param",
    });

    const [membership] = await db
      .select({
        role: member.role,
        expensesEnabled: householdFeatures.expensesEnabled,
        choresEnabled: householdFeatures.choresEnabled,
        shoppingEnabled: householdFeatures.shoppingEnabled,
        aiEnabled: householdFeatures.aiEnabled,
      })
      .from(member)
      .leftJoin(
        householdFeatures,
        eq(householdFeatures.organizationId, member.organizationId)
      )
      .where(
        and(eq(member.organizationId, householdId), eq(member.userId, userId))
      )
      .limit(1);
    if (!membership) {
      throw notFound();
    }

    const requiredModule = this.reflector.get<FeatureId>(
      REQUIRED_MODULE,
      context.getHandler()
    );
    if (requiredModule !== undefined) {
      if (
        membership.expensesEnabled === null ||
        membership.choresEnabled === null ||
        membership.shoppingEnabled === null ||
        membership.aiEnabled === null
      ) {
        throw new Error(
          `Missing household_features row for organization ${householdId}`
        );
      }
      if (
        !isModuleEnabled(
          {
            expensesEnabled: membership.expensesEnabled,
            choresEnabled: membership.choresEnabled,
            shoppingEnabled: membership.shoppingEnabled,
            aiEnabled: membership.aiEnabled,
          },
          requiredModule
        )
      ) {
        throw moduleDisabled(requiredModule);
      }
    }

    const role = strongestRole(membership.role);
    const minRole =
      this.reflector.get<HouseholdRole>(MIN_ROLE, context.getHandler()) ??
      "member";
    if (!hasRole(role, minRole)) {
      throw forbidden();
    }

    request.household = { householdId, role, userId };
    return true;
  }
}
