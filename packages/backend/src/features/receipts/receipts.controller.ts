import {
  AssignReceiptItemsRequest,
  ConfirmReceiptRequest,
  type ConfirmReceiptResponse,
  CreateReceiptRequest,
  endpoints,
  Id,
  ListReceiptsQuery,
  PurchaseReceiptShoppingItemsRequest,
  type PurchaseReceiptShoppingItemsResponse,
  type Receipt,
  type ReceiptListResponse,
  type ReceiptShoppingMatchesResponse,
  type ReceiptSplit,
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
import { ReceiptConfirmationService } from "./receipt-confirmation.service";
import { ReceiptShoppingService } from "./receipt-shopping.service";
import { ReceiptsService } from "./receipts.service";

/** Writes need `expenses`; `AiService` also checks `ai` before reading a receipt. */
@Controller()
export class ReceiptsController {
  private readonly receipts: ReceiptsService;
  private readonly confirmation: ReceiptConfirmationService;
  private readonly shopping: ReceiptShoppingService;

  constructor(
    @Inject(ReceiptsService) receipts: ReceiptsService,
    @Inject(ReceiptConfirmationService)
    confirmation: ReceiptConfirmationService,
    @Inject(ReceiptShoppingService) shopping: ReceiptShoppingService
  ) {
    this.receipts = receipts;
    this.confirmation = confirmation;
    this.shopping = shopping;
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

  @HouseholdRoute(endpoints.assignReceiptItems, { module: "expenses" })
  assignReceiptItems(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id,
    @Body(new ZodPipe(AssignReceiptItemsRequest))
    body: AssignReceiptItemsRequest
  ): Promise<Receipt> {
    return this.confirmation.assign(household.householdId, receiptId, body);
  }

  @HouseholdRoute(endpoints.getReceiptSplit)
  getReceiptSplit(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id
  ): Promise<ReceiptSplit> {
    return this.confirmation.split(household.householdId, receiptId);
  }

  /** Any member may confirm, as any member may record an expense. */
  @HouseholdRoute(endpoints.confirmReceipt, { module: "expenses" })
  confirmReceipt(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id,
    @Body(new ZodPipe(ConfirmReceiptRequest)) body: ConfirmReceiptRequest
  ): Promise<ConfirmReceiptResponse> {
    return this.confirmation.confirm(household, receiptId, body);
  }

  /** `shopping` for the route; `AiService` also checks `ai`. */
  @HouseholdRoute(endpoints.suggestReceiptShoppingMatches, {
    module: "shopping",
  })
  suggestReceiptShoppingMatches(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id
  ): Promise<ReceiptShoppingMatchesResponse> {
    return this.shopping.suggest(household.householdId, receiptId);
  }

  @HouseholdRoute(endpoints.purchaseReceiptShoppingItems, {
    module: "shopping",
  })
  purchaseReceiptShoppingItems(
    @CurrentHousehold() household: HouseholdContext,
    @Param("receiptId", new ZodPipe(Id)) receiptId: Id,
    @Body(new ZodPipe(PurchaseReceiptShoppingItemsRequest))
    body: PurchaseReceiptShoppingItemsRequest
  ): Promise<PurchaseReceiptShoppingItemsResponse> {
    return this.shopping.purchase(household.householdId, receiptId, body);
  }
}
