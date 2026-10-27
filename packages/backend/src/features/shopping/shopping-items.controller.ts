import {
  type ClearPurchasedShoppingItemsResponse,
  CreateShoppingItemRequest,
  endpoints,
  Id,
  ListShoppingItemsQuery,
  type PurchasedShoppingItem,
  type ShoppingItem,
  type ShoppingItemListResponse,
  type UnpurchasedShoppingItem,
  UpdateShoppingItemRequest,
} from "@homesplit/contracts";
import { Body, Controller, Inject, Param, Query } from "@nestjs/common";
import {
  CurrentHousehold,
  HouseholdRoute,
} from "@/features/households/access/household.decorators";
import type { HouseholdContext } from "@/features/households/access/household.guard";
import { PatchPipe } from "@/http/patch.pipe";
import { ZodPipe } from "@/http/zod.pipe";
import { ShoppingItemsService } from "./shopping-items.service";

@Controller()
export class ShoppingItemsController {
  private readonly items: ShoppingItemsService;

  constructor(@Inject(ShoppingItemsService) items: ShoppingItemsService) {
    this.items = items;
  }

  @HouseholdRoute(endpoints.listShoppingItems)
  listShoppingItems(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(ListShoppingItemsQuery)) query: ListShoppingItemsQuery
  ): Promise<ShoppingItemListResponse> {
    return this.items.list(household.householdId, query);
  }

  @HouseholdRoute(endpoints.createShoppingItem, { module: "shopping" })
  createShoppingItem(
    @CurrentHousehold() household: HouseholdContext,
    @Body(new ZodPipe(CreateShoppingItemRequest))
    body: CreateShoppingItemRequest
  ): Promise<ShoppingItem> {
    return this.items.create(household, body);
  }

  @HouseholdRoute(endpoints.getShoppingItem)
  getShoppingItem(
    @CurrentHousehold() household: HouseholdContext,
    @Param("itemId", new ZodPipe(Id)) itemId: Id
  ): Promise<ShoppingItem> {
    return this.items.get(household.householdId, itemId);
  }

  @HouseholdRoute(endpoints.updateShoppingItem, { module: "shopping" })
  updateShoppingItem(
    @CurrentHousehold() household: HouseholdContext,
    @Param("itemId", new ZodPipe(Id)) itemId: Id,
    @Body(new PatchPipe(UpdateShoppingItemRequest))
    body: UpdateShoppingItemRequest
  ): Promise<ShoppingItem> {
    return this.items.update(household.householdId, itemId, body);
  }

  @HouseholdRoute(endpoints.deleteShoppingItem, { module: "shopping" })
  async deleteShoppingItem(
    @CurrentHousehold() household: HouseholdContext,
    @Param("itemId", new ZodPipe(Id)) itemId: Id
  ): Promise<void> {
    await this.items.delete(household.householdId, itemId);
  }

  @HouseholdRoute(endpoints.purchaseShoppingItem, { module: "shopping" })
  purchaseShoppingItem(
    @CurrentHousehold() household: HouseholdContext,
    @Param("itemId", new ZodPipe(Id)) itemId: Id
  ): Promise<PurchasedShoppingItem> {
    return this.items.purchase(household, itemId);
  }

  @HouseholdRoute(endpoints.unpurchaseShoppingItem, { module: "shopping" })
  unpurchaseShoppingItem(
    @CurrentHousehold() household: HouseholdContext,
    @Param("itemId", new ZodPipe(Id)) itemId: Id
  ): Promise<UnpurchasedShoppingItem> {
    return this.items.unpurchase(household.householdId, itemId);
  }

  @HouseholdRoute(endpoints.clearPurchasedShoppingItems, { module: "shopping" })
  clearPurchasedShoppingItems(
    @CurrentHousehold() household: HouseholdContext
  ): Promise<ClearPurchasedShoppingItemsResponse> {
    return this.items.clearPurchased(household.householdId);
  }
}
