import type { Endpoint } from "@homesplit/contracts";
import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Route } from "../../../route.decorator";
import {
  type HouseholdContext,
  HouseholdGuard,
  type HouseholdRequest,
  MIN_ROLE,
} from "./household.guard";
import type { HouseholdRole } from "./roles";

/** `@Route` for a `/api/households/:householdId/...` endpoint, behind `HouseholdGuard`. */
export const HouseholdRoute = (
  endpoint: Endpoint,
  { minRole = "member" }: { minRole?: HouseholdRole } = {}
) =>
  applyDecorators(
    Route(endpoint),
    SetMetadata(MIN_ROLE, minRole),
    UseGuards(HouseholdGuard)
  );

/** The `HouseholdContext` that `HouseholdGuard` attached to the request. */
export const CurrentHousehold = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HouseholdContext => {
    const { household } = context.switchToHttp().getRequest<HouseholdRequest>();
    if (!household) {
      throw new Error("@CurrentHousehold() needs a @HouseholdRoute handler");
    }
    return household;
  }
);
