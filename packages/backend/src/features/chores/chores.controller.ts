import {
  type Chore,
  type ChoreListResponse,
  type CompleteChoreResponse,
  CreateChoreRequest,
  endpoints,
  Id,
  ListChoresQuery,
  type ReopenChoreResponse,
  UpdateChoreRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, Query } from "@nestjs/common";
import type { z } from "zod";

import { PatchPipe } from "@/http/patch.pipe";
import { ZodPipe } from "@/http/zod.pipe";
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

  @HouseholdRoute(endpoints.createChore, { module: "chores" })
  create(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(CreateChoreRequest)) body: CreateChoreDto
  ): Promise<Chore> {
    return this.chores.create(household.householdId, household.userId, body);
  }

  @HouseholdRoute(endpoints.listChores)
  list(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(ListChoresQuery)) query: ListChoresQueryDto
  ): Promise<ChoreListResponse> {
    return this.chores.list(household.householdId, query);
  }

  @HouseholdRoute(endpoints.getChore)
  getOne(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId", new ZodPipe(Id)) choreId: string
  ): Promise<Chore> {
    return this.chores.getById(household.householdId, choreId);
  }

  @HouseholdRoute(endpoints.updateChore, { module: "chores" })
  update(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId", new ZodPipe(Id)) choreId: string,
    @Body(new PatchPipe(UpdateChoreRequest)) body: UpdateChoreDto
  ): Promise<Chore> {
    return this.chores.update(household.householdId, choreId, body);
  }

  @HouseholdRoute(endpoints.deleteChore, { module: "chores" })
  async delete(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId", new ZodPipe(Id)) choreId: string
  ): Promise<void> {
    await this.chores.delete(household.householdId, choreId);
  }

  @HouseholdRoute(endpoints.completeChore, { module: "chores" })
  complete(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId", new ZodPipe(Id)) choreId: string
  ): Promise<CompleteChoreResponse> {
    return this.chores.complete(
      household.householdId,
      choreId,
      household.userId
    );
  }

  @HouseholdRoute(endpoints.reopenChore, { module: "chores" })
  reopen(
    @CurrentHousehold() household: HouseholdContext,
    @Param("choreId", new ZodPipe(Id)) choreId: string
  ): Promise<ReopenChoreResponse> {
    return this.chores.reopen(household.householdId, choreId);
  }
}
