import { HouseholdIdParams } from "@homesplit/contracts";
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
import { member } from "@/db/schema";
import { forbidden, notFound } from "@/http/app-error";
import { ZodPipe } from "@/http/zod.pipe";
import { type HouseholdRole, hasRole, strongestRole } from "./roles";

export const MIN_ROLE = Symbol("household:minRole");

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
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.organizationId, householdId), eq(member.userId, userId))
      )
      .limit(1);
    if (!membership) {
      throw notFound();
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
