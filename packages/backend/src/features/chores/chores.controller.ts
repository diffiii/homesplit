import {
  type Chore,
  type ChoreListResponse,
  type CreateChoreRequest,
  endpoints,
  type ListChoresQuery,
  UpdateChoreRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, Query } from "@nestjs/common";
import type { z } from "zod";

import { PatchPipe } from "@/http/patch.pipe";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "../households/access/household.decorators";
import type { HouseholdContext } from "../households/access/household.guard";
import { ChoresService } from "./chores.service";

type CreateChoreDto = z.infer<typeof CreateChoreRequest>;
type UpdateChoreDto = z.infer<typeof UpdateChoreRequest>;
type ListChoresQueryDto = z.infer<typeof ListChoresQuery>;

@Controller()
export class ChoresController {
  private readonly chores: ChoresService;

  constructor(@Inject(ChoresService) chores: ChoresService) {
    this.chores = chores;
  }

  @HouseholdRoute(endpoints.createChore)
  create(
    @CurrentHousehold() household: HouseholdContext,
    @Body() body: CreateChoreDto
  ): Promise<Chore> {
    return this.chores.create(household.householdId, household.userId, body);
  }

  @HouseholdRoute(endpoints.listChores)
  list(
    @CurrentHousehold() household: HouseholdContext,
    @Query() query: ListChoresQueryDto
  ): Promise<ChoreListResponse> {
    return this.chores.list(household.householdId, query);
  }

  @HouseholdRoute(endpoints.getChore)
  getOne(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId") choreId: string
  ): Promise<Chore> {
    return this.chores.getById(household.householdId, choreId);
  }

  @HouseholdRoute(endpoints.updateChore)
  update(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId") choreId: string,
    @Body(new PatchPipe(UpdateChoreRequest))
    body: UpdateChoreDto
  ): Promise<Chore> {
    return this.chores.update(household.householdId, choreId, body);
  }

  @HouseholdRoute(endpoints.deleteChore)
  async delete(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId") choreId: string
  ): Promise<void> {
    await this.chores.delete(household.householdId, choreId);
  }
}
