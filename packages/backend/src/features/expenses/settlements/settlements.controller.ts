import {
  type ConfirmedSettlement,
  endpoints,
  Id,
  ListSettlementHistoryQuery,
  ProcessSettlementRequest,
  type Settlement,
  type SettlementListResponse,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, Query } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { ZodPipe } from "@/http/zod.pipe";
import { SettlementsService } from "./settlements.service";

@Controller()
export class SettlementsController {
  private readonly settlements: SettlementsService;

  constructor(@Inject(SettlementsService) settlements: SettlementsService) {
    this.settlements = settlements;
  }

  @HouseholdRoute(endpoints.listSettlements)
  listSettlements(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(ListSettlementHistoryQuery))
    query: ListSettlementHistoryQuery
  ): Promise<SettlementListResponse> {
    return this.settlements.list(household.householdId, query);
  }

  @HouseholdRoute(endpoints.processSettlement, { module: "expenses" })
  processSettlement(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(ProcessSettlementRequest)) body: ProcessSettlementRequest
  ): Promise<Settlement> {
    return this.settlements.record(household, body);
  }

  @HouseholdRoute(endpoints.confirmSettlement, { module: "expenses" })
  confirmSettlement(
    @CurrentHousehold() household: HouseholdContext,
    @Param("settlementId", new ZodPipe(Id)) settlementId: Id
  ): Promise<ConfirmedSettlement> {
    return this.settlements.confirm(household, settlementId);
  }

  @HouseholdRoute(endpoints.deleteSettlement, { module: "expenses" })
  async deleteSettlement(
    @CurrentHousehold() household: HouseholdContext,
    @Param("settlementId", new ZodPipe(Id)) settlementId: Id
  ): Promise<void> {
    await this.settlements.delete(household, settlementId);
  }
}
