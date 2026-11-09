import type { Endpoint, FeatureId, HouseholdRole } from "@homesplit/contracts";
import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Route } from "@/route.decorator";
import {
  type HouseholdContext,
  HouseholdGuard,
  type HouseholdRequest,
  MIN_ROLE,
  REQUIRED_MODULE,
} from "./household.guard";

/** `@Route` for a `/api/households/:householdId/...` endpoint, behind `HouseholdGuard`. */
export const HouseholdRoute = (
  endpoint: Endpoint,
  {
    minRole = "member",
    module,
  }: { minRole?: HouseholdRole; module?: FeatureId } = {}
) =>
  applyDecorators(
    Route(endpoint),
    SetMetadata(MIN_ROLE, minRole),
    ...(endpoint.method !== "GET" && module !== undefined
      ? [SetMetadata(REQUIRED_MODULE, module)]
      : []),
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
