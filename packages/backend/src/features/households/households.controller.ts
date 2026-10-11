import { endpoints } from "@homesplit/contracts";
import { Controller, Inject } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "./access/household.decorators";
import type { HouseholdContext } from "./access/household.guard";
import { HouseholdsService } from "./households.service";

@Controller()
export class HouseholdsController {
  private readonly households: HouseholdsService;

  constructor(@Inject(HouseholdsService) households: HouseholdsService) {
    this.households = households;
  }

  @HouseholdRoute(endpoints.deleteHousehold, { minRole: "owner" })
  async deleteHousehold(
    @CurrentHousehold() household: HouseholdContext
  ): Promise<void> {
    await this.households.deleteHousehold(household.householdId);
  }
}
