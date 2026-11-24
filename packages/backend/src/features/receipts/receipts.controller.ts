import {
  CreateReceiptRequest,
  endpoints,
  Id,
  ListReceiptsQuery,
  type Receipt,
  type ReceiptListResponse,
  UpdateReceiptRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, Query } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { PatchPipe } from "@/http/patch.pipe";
import { ZodPipe } from "@/http/zod.pipe";
import { ReceiptsService } from "./receipts.service";

/** Writes need `expenses`; `AiService` also checks `ai` before reading a receipt. */
@Controller()
export class ReceiptsController {
  private readonly receipts: ReceiptsService;

  constructor(@Inject(ReceiptsService) receipts: ReceiptsService) {
    this.receipts = receipts;
  }

  @HouseholdRoute(endpoints.listReceipts)
  listReceipts(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(ListReceiptsQuery)) query: ListReceiptsQuery
  ): Promise<ReceiptListResponse> {
    return this.receipts.list(household.householdId, query);
  }

  @HouseholdRoute(endpoints.createReceipt, { module: "expenses" })
  createReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(CreateReceiptRequest)) body: CreateReceiptRequest
  ): Promise<Receipt> {
    return this.receipts.create(household, body);
  }

  @HouseholdRoute(endpoints.getReceipt)
  getReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id
  ): Promise<Receipt> {
    return this.receipts.get(household.householdId, receiptId);
  }

  @HouseholdRoute(endpoints.updateReceipt, { module: "expenses" })
  updateReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id,
    @Body(new PatchPipe(UpdateReceiptRequest)) body: UpdateReceiptRequest
  ): Promise<Receipt> {
    return this.receipts.update(household.householdId, receiptId, body);
  }

  @HouseholdRoute(endpoints.deleteReceipt, { module: "expenses" })
  async deleteReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id
  ): Promise<void> {
    await this.receipts.delete(household.householdId, receiptId);
  }

  @HouseholdRoute(endpoints.retryReceipt, { module: "expenses" })
  retryReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id
  ): Promise<Receipt> {
    return this.receipts.retry(household.householdId, receiptId);
  }
}
