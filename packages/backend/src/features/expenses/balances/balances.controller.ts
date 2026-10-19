import {
  type BalanceListResponse,
  endpoints,
  type UserBalanceListResponse,
} from "@homesplit/contracts";
import { Controller, Inject } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { Route } from "@/route.decorator";
import { BalancesService } from "./balances.service";

@Controller()
export class BalancesController {
  private readonly balances: BalancesService;

  constructor(@Inject(BalancesService) balances: BalancesService) {
    this.balances = balances;
  }

  @HouseholdRoute(endpoints.listBalances)
  listBalances(
    @CurrentHousehold() household: HouseholdContext
  ): Promise<BalanceListResponse> {
    return this.balances.listForHousehold(household.householdId);
  }

  /** One query for all of the user's households, not one per household. */
  @Route(endpoints.listMyBalances)
  listMyBalances(
    @Session() session: UserSession
  ): Promise<UserBalanceListResponse> {
    return this.balances.listForUser(session.user.id);
  }
}
