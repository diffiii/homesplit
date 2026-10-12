import {
  endpoints,
  type HouseholdFeatures,
  UpdateHouseholdFeaturesRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject } from "@nestjs/common";
import { PatchPipe } from "@/http/patch.pipe";
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

  @HouseholdRoute(endpoints.getHouseholdFeatures)
  getHouseholdFeatures(
    @CurrentHousehold() household: HouseholdContext
  ): Promise<HouseholdFeatures> {
    return this.households.getFeatures(household.householdId);
  }

  @HouseholdRoute(endpoints.updateHouseholdFeatures, { minRole: "admin" })
  updateHouseholdFeatures(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new PatchPipe(UpdateHouseholdFeaturesRequest))
    body: UpdateHouseholdFeaturesRequest
  ): Promise<HouseholdFeatures> {
    return this.households.updateFeatures(household.householdId, body);
  }

  @HouseholdRoute(endpoints.deleteHousehold, { minRole: "owner" })
  async deleteHousehold(
    @CurrentHousehold() household: HouseholdContext
  ): Promise<void> {
    await this.households.deleteHousehold(household.householdId);
  }
}
